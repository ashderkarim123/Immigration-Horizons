const express = require('express');
const router = express.Router();

const ClientCase = require('../../../../models/ClientCase');
const CaseDocument = require('../../../../models/CaseDocument');
const DocumentRequest = require('../../../../models/DocumentRequest');
const ConsultationInteraction = require('../../../../models/ConsultationInteraction');
const Task = require('../../../../models/admin/Task');
const { loadInbox } = require('../../../../services/staffChatService');
const { loadWorkQueues } = require('../../../../services/staffWorkQueues');
const { accessibleCaseIdFilter } = require('../../../../services/casePolicy');
const { ACTIVE_UNANSWERED_STATUSES } = require('../../../../utils/interactionConstants');
const { can } = require('../../../../utils/permissions');
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');

const UPCOMING_DEADLINE_DAYS = 30;

function serializeRecentCase(c) {
  return {
    id: c._id,
    caseNumber: c.caseNumber,
    title: c.title,
    caseType: c.caseType,
    currentStage: c.currentStage,
    priority: c.priority,
    targetFilingDate: c.targetFilingDate || null,
    updatedAt: c.updatedAt,
  };
}

function serializeMyTask(t) {
  return {
    id: t._id,
    title: t.title,
    type: t.type,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate || null,
  };
}

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

    // For queries, if they can't see queries, scope to empty. If they can but don't have view_all, they see all?
    // Wait, in Next.js `queryScopeFilter` is used. We don't have a `queryScopeFilter` in Express yet, 
    // but the Next.js one scopes queries to `assignee: actor.adminUserId` if they aren't queries.view_all.
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
        .select('caseNumber title caseType currentStage priority targetFilingDate updatedAt')
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean();
    }

    const myTasks = await Task.find({ ...taskScope, assignee: req.staff._id, status: { $ne: 'completed' } })
      .select('title type status priority dueDate')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(8)
      .lean();

    const upcomingDeadlines = upcomingCaseDeadlines + upcomingTaskDeadlines;

    res.json({
      data: {
        role: req.staff.role,
        workspaceLabel: can(req, 'cases.view_all') ? 'Operations overview' : can(req, 'cases.manage') ? 'My case portfolio' : can(req, 'petitions.review') ? 'Review queue' : 'My assigned work',
        workQueues: (await loadWorkQueues(req)).map(({ items, ...queue }) => ({ ...queue, items: items.slice(0, 5) })),
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
        recentCases: recentCases.map(serializeRecentCase),
        myTasks: myTasks.map(serializeMyTask),
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
