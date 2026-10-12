const express = require('express');
const router = express.Router();

const ClientCase = require('../../../../models/ClientCase');
const CaseDocument = require('../../../../models/CaseDocument');
const DocumentRequest = require('../../../../models/DocumentRequest');
const ConsultationInteraction = require('../../../../models/ConsultationInteraction');
const Task = require('../../../../models/admin/Task');
const AdminUser = require('../../../../models/admin/User');
const CaseActivity = require('../../../../models/CaseActivity');
const WorkspaceMember = require('../../../../models/WorkspaceMember');
const CaseWorkspace = require('../../../../models/CaseWorkspace');
const { addClientNames, clientDisplayName } = require('../../../../services/caseRef');
const { taskActionContext, taskAccess, serializeTask, populated } = require('../../../../services/taskDto');
const { loadInbox } = require('../../../../services/staffChatService');
const { loadWorkQueues } = require('../../../../services/staffWorkQueues');
const { accessibleCaseIdFilter } = require('../../../../services/casePolicy');
const { ACTIVE_UNANSWERED_STATUSES } = require('../../../../utils/interactionConstants');
const { can } = require('../../../../utils/permissions');
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');

const UPCOMING_DEADLINE_DAYS = 30;

const NEW_CASE_DAYS = 7;
const CLIENT_CASE_ROWS = 12;
const ACTIVITY_ROWS = 12;
const OPEN_REQUEST_STATUSES = ['open', 'replacement_required'];
const REVIEW_QUEUES = ['document_review', 'forms_review', 'petition_review', 'packet_review'];
// Housekeeping events that say nothing a person needs to act on; the full trail stays on the case.
const QUIET_ACTIVITY = ['workspace_created', 'category_provisioned', 'category_reordered', 'channel_provisioned', 'channel_reordered', 'form_provisioned', 'client_membership_created'];

/**
 * A case as staff recognise it: the client first, then the service, where it stands, who owns it and what is next.
 * The case number is carried as a reference only. `client.id` is present only for someone who may open client records.
 */
function serializeClientCase(c, { nextAction, openTasks, openRequests, canOpenClient }) {
  const client = c.primaryClient;
  return {
    id: c._id,
    caseNumber: c.caseNumber,
    title: c.title,
    caseType: c.caseType,
    currentStage: c.currentStage,
    priority: c.priority,
    targetFilingDate: c.targetFilingDate || null,
    updatedAt: c.updatedAt,
    client: client ? { id: canOpenClient ? client._id : null, name: clientDisplayName(client) } : null,
    projectManager: c.projectManager ? { id: c.projectManager._id, name: c.projectManager.name || '' } : null,
    nextAction: nextAction ? { taskId: nextAction._id, title: nextAction.title, dueDate: nextAction.dueDate || null, assignee: nextAction.assignee ? nextAction.assignee.name || '' : null } : null,
    pending: { openTasks, documentRequests: openRequests },
  };
}

/** Dated work first (soonest first), undated last: Mongo alone would put undated tasks at the top. */
const byDueDate = (a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

router.get('/', staffAuthMiddleware, async (req, res, next) => {
  try {
    const canSeeCases = can(req, 'cases.view');
    const canSeeDocuments = can(req, 'documents.view');
    const canSeeQueries = can(req, 'queries.view');
    const canSeeChannels = can(req, 'channels.view');

    // Case scope
    const caseFilter = canSeeCases ? await accessibleCaseIdFilter(req) : { _id: { $in: [] } };
    const caseScope = caseFilter ?? {};
    const caseIdScope = caseFilter ? { case: caseFilter._id } : {};
    const taskScope = caseFilter
      ? { $or: [{ case: null }, { case: caseFilter._id }] }
      : {};

    // Consultation and case queries use the same live policy as their list route.
    const queryScope = canSeeQueries
      ? await require('../../../../services/interactionPolicy').accessibleInteractionFilter(req)
      : { _id: { $in: [] } };

    const scopedQuery = (filter) => (queryScope ? { $and: [filter, queryScope] } : filter);

    const [
      myCases,
      unassignedCases,
      upcomingCaseDeadlines,
      upcomingTaskDeadlines,
      documentsAwaitingReview,
      overdueDocumentRequests,
      unansweredQueries,
      queriesAwaitingScheduling,
      unreadClientMessages,
      myOpenTasks,
      myOverdueTasks,
    ] = await Promise.all([
      canSeeCases ? ClientCase.countDocuments({ ...caseScope, archivedAt: null }) : Promise.resolve(0),

      can(req, 'cases.assign') || can(req, 'cases.view_all')
        ? ClientCase.countDocuments({
            archivedAt: null,
            $or: [{ projectManager: null }, { projectManager: { $exists: false } }],
          })
        : Promise.resolve(0),

      canSeeCases
        ? ClientCase.countDocuments({
            ...caseScope,
            archivedAt: null,
            targetFilingDate: { $ne: null, $gte: new Date(), $lte: daysFromNow(UPCOMING_DEADLINE_DAYS) },
          })
        : Promise.resolve(0),

      Task.countDocuments({
        ...taskScope,
        assignee: req.staff._id,
        status: { $ne: 'completed' },
        dueDate: { $ne: null, $gte: new Date(), $lte: daysFromNow(UPCOMING_DEADLINE_DAYS) },
      }),

      canSeeDocuments
        ? CaseDocument.countDocuments({
            ...caseIdScope,
            status: { $in: ['uploaded', 'pending_review'] },
            archivedAt: null,
          })
        : Promise.resolve(0),

      canSeeDocuments
        ? DocumentRequest.countDocuments({
            ...caseIdScope,
            status: 'open',
            dueDate: { $ne: null, $lt: new Date() },
          })
        : Promise.resolve(0),

      canSeeQueries
        ? ConsultationInteraction.countDocuments(scopedQuery({ status: { $in: ACTIVE_UNANSWERED_STATUSES } }))
        : Promise.resolve(0),

      canSeeQueries
        ? ConsultationInteraction.countDocuments(
            scopedQuery({
              type: 'scheduled_consultation',
              scheduledFor: null,
              status: { $in: ACTIVE_UNANSWERED_STATUSES },
            })
          )
        : Promise.resolve(0),

      canSeeChannels && canSeeCases ? loadInbox(req, { filter: 'unread', limit: 1 }).then(inbox => inbox.unreadTotal) : Promise.resolve(0),

      Task.countDocuments({ ...taskScope, assignee: req.staff._id, status: { $ne: 'completed' } }),
      Task.countDocuments({
        ...taskScope,
        assignee: req.staff._id,
        status: { $ne: 'completed' },
        dueDate: { $ne: null, $lt: new Date() },
      }),
    ]);

    // Also fetch Dashboard cases (Recent cases) and Open Tasks
    let recentCases = [];
    if (canSeeCases) {
      recentCases = await ClientCase.find({ ...caseScope, archivedAt: null })
        .select('caseNumber title caseType currentStage priority targetFilingDate updatedAt primaryClient projectManager')
        .populate('primaryClient', 'firstName lastName email')
        .populate('projectManager', 'name')
        .sort({ updatedAt: -1 })
        .limit(CLIENT_CASE_ROWS)
        .lean();
    }
    const rowCaseIds = recentCases.map((c) => c._id);

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);
    const mine = { ...taskScope, assignee: req.staff._id, status: { $ne: 'completed' } };

    const [caseTasks, requestCounts, activeClients, tasksDueToday, newMemberships, activityRows, myTaskRows, taskCtx, queues] = await Promise.all([
      // The next thing to do on each listed case, and how much is open on it.
      rowCaseIds.length ? Task.find({ case: { $in: rowCaseIds }, status: { $ne: 'completed' } }).select('title dueDate case assignee').populate('assignee', 'name').lean() : [],
      rowCaseIds.length && canSeeDocuments ? DocumentRequest.aggregate([{ $match: { case: { $in: rowCaseIds }, status: { $in: OPEN_REQUEST_STATUSES } } }, { $group: { _id: '$case', count: { $sum: 1 } } }]) : [],
      canSeeCases ? ClientCase.distinct('primaryClient', { ...caseScope, archivedAt: null }).then((ids) => ids.length) : 0,
      Task.countDocuments({ ...mine, dueDate: { $gte: today, $lt: tomorrow } }),
      canSeeCases ? WorkspaceMember.find({ memberType: 'employee', adminUser: req.staff._id, status: 'active', createdAt: { $gte: daysFromNow(-NEW_CASE_DAYS) } }).select('workspace').lean() : [],
      canSeeCases ? CaseActivity.find({ ...caseIdScope, type: { $nin: QUIET_ACTIVITY } }).select('case type message actorName createdAt').sort({ createdAt: -1 }).limit(ACTIVITY_ROWS).lean() : [],
      populated(Task.find(mine).sort({ dueDate: 1, createdAt: -1 }).limit(60)).lean(),
      taskActionContext(req),
      loadWorkQueues(req),
    ]);

    const newAssignedCases = newMemberships.length
      ? await ClientCase.countDocuments({ archivedAt: null, _id: { $in: (await CaseWorkspace.find({ _id: { $in: newMemberships.map((m) => m.workspace) } }).select('case').lean()).map((w) => w.case) } })
      : 0;

    const requestsByCase = new Map(requestCounts.map((r) => [String(r._id), r.count]));
    const clientCases = recentCases.map((c) => {
      const open = caseTasks.filter((t) => String(t.case) === String(c._id)).sort(byDueDate);
      // My own next task on the case if I have one; otherwise the case's next task.
      const nextAction = open.find((t) => t.assignee && String(t.assignee._id) === String(req.staff._id)) || open[0] || null;
      return serializeClientCase(c, { nextAction, openTasks: open.length, openRequests: canSeeDocuments ? requestsByCase.get(String(c._id)) || 0 : null, canOpenClient: can(req, 'clients.view') });
    });

    const myTasks = myTaskRows.sort(byDueDate).slice(0, 8).map((t) => serializeTask(t, taskAccess(req, t, taskCtx)));
    await addClientNames(myTasks.map((t) => t.case));

    const activityCases = await ClientCase.find({ _id: { $in: activityRows.map((a) => a.case) } }).select('caseNumber title').lean();
    const recentActivity = activityRows.map((a) => {
      const c = activityCases.find((x) => String(x._id) === String(a.case));
      return { id: a._id, type: a.type, message: a.message, actorName: a.actorName || 'System', createdAt: a.createdAt, case: { id: a.case, caseNumber: c ? c.caseNumber : '', title: c ? c.title : '' } };
    });
    await addClientNames(recentActivity.map((a) => a.case));

    // Cards derived from the work queues, so they follow the same capabilities and row scope as the queues themselves.
    const queueCases = (keys) => {
      const present = queues.filter((q) => keys.includes(q.key));
      return present.length ? new Set(present.flatMap((q) => q.items.map((i) => i.caseId))).size : null;
    };

    const upcomingDeadlines = upcomingCaseDeadlines + upcomingTaskDeadlines;
    let employeeWorkload = [];
    if (can(req, 'cases.view_all') && can(req, 'tasks.view_all')) {
      const rows = await Task.aggregate([
        { $match: { status: { $ne: 'completed' }, assignee: { $ne: null } } },
        { $group: { _id: '$assignee', openTasks: { $sum: 1 }, overdueTasks: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', new Date()] }] }, 1, 0] } } } },
        { $sort: { overdueTasks: -1, openTasks: -1, _id: 1 } },
      ]);
      const employees = await AdminUser.find({ _id: { $in: rows.map(row => row._id) } }).select('name').lean();
      employeeWorkload = rows.map(row => ({ employeeId: String(row._id), name: employees.find(e => String(e._id) === String(row._id))?.name || 'Former employee', openTasks: row.openTasks, overdueTasks: row.overdueTasks }));
    }

    res.json({
      data: {
        role: req.staff.role,
        workspaceLabel: can(req, 'cases.view_all') ? 'Operations overview' : can(req, 'cases.manage') ? 'My case portfolio' : can(req, 'petitions.review') ? 'Review queue' : 'My assigned work',
        scope: can(req, 'cases.view_all') ? 'organization' : 'mine',
        workQueues: queues.map(({ items, ...queue }) => ({ ...queue, items: items.slice(0, 5) })),
        activeClients,
        tasksDueToday,
        newAssignedCases,
        // null (not 0) when the actor has none of the queues behind the card, so the card is hidden
        casesAwaitingClientDocuments: queueCases(['requested_documents']),
        casesAwaitingReview: queueCases(REVIEW_QUEUES),
        clientCases,
        recentActivity,
        employeeWorkload,
        // null (not 0) when the actor cannot see USCIS tracking, so the card is hidden rather than misleadingly empty
        uscisActionRequired: can(req, 'uscis_tracking.view') ? await require('../../../../services/uscisTracking').countActionRequired(req) : null,
        myCases,
        unassignedCases,
        upcomingDeadlines,
        documentsAwaitingReview,
        overdueDocumentRequests,
        unansweredQueries,
        queriesAwaitingScheduling,
        unreadClientMessages,
        myOpenTasks,
        myOverdueTasks,
        myTasks,
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
