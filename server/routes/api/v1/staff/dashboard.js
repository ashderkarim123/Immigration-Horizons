const express = require('express');
const router = express.Router();

const ClientCase = require('../../../../models/ClientCase');
const CaseDocument = require('../../../../models/CaseDocument');
const DocumentRequest = require('../../../../models/DocumentRequest');
const ConsultationInteraction = require('../../../../models/ConsultationInteraction');
const Task = require('../../../../models/admin/Task');
const { countUnreadClientMessages } = require('../../../../services/operationsQueues');
const { accessibleCaseIdFilter } = require('../../../../services/casePolicy');
const { ACTIVE_UNANSWERED_STATUSES } = require('../../../../utils/interactionConstants');
const { can } = require('../../../../utils/permissions');
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');

const UPCOMING_DEADLINE_DAYS = 30;

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

    // For queries, if they can't see queries, scope to empty. If they can but don't have view_all, they see all?
    // Wait, in Next.js `queryScopeFilter` is used. We don't have a `queryScopeFilter` in Express yet, 
    // but the Next.js one scopes queries to `assignee: actor.adminUserId` if they aren't queries.view_all.
    const canViewAllQueries = can(req, 'queries.view_all');
    const queryScope = canSeeQueries
      ? (canViewAllQueries ? null : { assignee: req.staff._id })
      : { _id: { $in: [] } };

    const scopedQuery = (filter) => (queryScope ? { $and: [filter, queryScope] } : filter);

    const [
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
    ] = await Promise.all([
      canSeeCases ? ClientCase.countDocuments({ ...caseScope, archivedAt: null }) : Promise.resolve(null),

      can(req, 'cases.assign') || can(req, 'cases.view_all')
        ? ClientCase.countDocuments({
            archivedAt: null,
            $or: [{ projectManager: null }, { projectManager: { $exists: false } }],
          })
        : Promise.resolve(null),

      canSeeCases
        ? ClientCase.countDocuments({
            ...caseScope,
            archivedAt: null,
            targetFilingDate: { $ne: null, $gte: new Date(), $lte: daysFromNow(UPCOMING_DEADLINE_DAYS) },
          })
        : Promise.resolve(null),

      canSeeDocuments
        ? CaseDocument.countDocuments({
            ...caseIdScope,
            status: { $in: ['uploaded', 'pending_review'] },
            archivedAt: null,
          })
        : Promise.resolve(null),

      canSeeDocuments
        ? DocumentRequest.countDocuments({
            ...caseIdScope,
            status: 'open',
            dueDate: { $ne: null, $lt: new Date() },
          })
        : Promise.resolve(null),

      canSeeQueries
        ? ConsultationInteraction.countDocuments(scopedQuery({ status: { $in: ACTIVE_UNANSWERED_STATUSES } }))
        : Promise.resolve(null),

      canSeeQueries
        ? ConsultationInteraction.countDocuments(
            scopedQuery({
              type: 'scheduled_consultation',
              scheduledFor: null,
              status: { $in: ACTIVE_UNANSWERED_STATUSES },
            })
          )
        : Promise.resolve(null),

      // Unread client messages currently in operationsQueues isn't scoped per-employee, but we can reuse it
      // or implement the per-employee logic later if needed. The prompt says "Reuse/migrate the existing meanings"
      // In Next.js: `countUnreadClientMessages(caseFilter)`
      canSeeChannels && canSeeCases ? countUnreadClientMessages(caseFilter) : Promise.resolve(null),

      Task.countDocuments({ assignee: req.staff._id, status: { $ne: 'completed' } }),
      Task.countDocuments({
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

    const myTasks = await Task.find({ assignee: req.staff._id, status: { $ne: 'completed' } })
      .select('title type status priority dueDate lead')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(8)
      .lean();

    res.json({
      data: {
        role: req.staff.role,
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
        recentCases,
        myTasks
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
