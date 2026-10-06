/**
 * Overview report (ADR-028). Snapshot metrics are the state right now; period metrics are events between from and to. Each
 * metric says which, and a metric the actor may not see is null (never a false zero): 0 only ever means authorized and
 * genuinely zero. Queue-style metrics reuse the Dashboard work-queue definitions so the two cannot disagree.
 */
const ClientCase = require('../../models/ClientCase');
const Task = require('../../models/admin/Task');
const USCISFiling = require('../../models/USCISFiling');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const { definitions } = require('../staffWorkQueues');
const { accessibleInteractionFilter } = require('../interactionPolicy');
const { ACTIVE_UNANSWERED_STATUSES } = require('../../utils/interactionConstants');
const { can } = require('../../utils/permissions');
const { taskScope, overdueTask } = require('./shared');

const metric = (key, label, basis, value, href) => ({ key, label, basis, value, href });

/** Unanswered queries inside the report scope: the live interaction policy, narrowed to the chosen cases when scope is narrowed. */
async function countQueries(req, ctx) {
  const access = await accessibleInteractionFilter(req);
  const filter = { $and: [access, { status: { $in: ACTIVE_UNANSWERED_STATUSES } }, ...(ctx.narrowed ? [ctx.caseCond('case')] : [])] };
  return ConsultationInteraction.countDocuments(filter);
}

async function run(req, ctx) {
  const caseView = ctx.canCases;
  const queueDefs = Object.fromEntries(definitions(req).map((d) => [d.key, d]));
  const queueCount = async (key) => {
    const def = queueDefs[key];
    if (!def || !caseView) return null;
    return def.model.countDocuments({ ...def.match, ...ctx.caseCond('case') });
  };

  const inPeriod = (field) => ({ [field]: { $gte: ctx.range.instantFrom, $lte: ctx.range.instantTo } });
  const taskView = caseView ? taskScope(req, ctx) : null;

  const [
    activeCases, openTasks, overdueTasks, unassignedTasks, documentsAwaitingReview, overdueDocumentRequests, missingEvidence,
    formsAwaitingReview, petitionsAwaitingReview, packetsAwaitingReview, uscisActionRequired, unansweredQueries,
    casesOpened, casesClosed, tasksCompleted,
  ] = await Promise.all([
    caseView ? ClientCase.countDocuments(ctx.activeCases) : null,
    caseView ? Task.countDocuments(taskView) : null,
    caseView ? Task.countDocuments({ ...taskView, ...overdueTask(ctx) }) : null,
    caseView && can(req, 'tasks.view_all') ? Task.countDocuments({ ...taskView, assignee: null }) : null,
    queueCount('document_review'),
    queueCount('document_requests'),
    queueCount('missing_evidence'),
    queueCount('forms_review'),
    queueCount('petition_review'),
    queueCount('packet_review'),
    caseView && can(req, 'uscis_tracking.view') ? USCISFiling.countDocuments({ archivedAt: null, actionRequired: true, ...ctx.caseCond('case') }) : null,
    can(req, 'queries.view') ? countQueries(req, ctx) : null,
    caseView ? ClientCase.countDocuments({ ...ctx.anyCases, ...inPeriod('openedAt') }) : null,
    caseView ? ClientCase.countDocuments({ ...ctx.anyCases, ...inPeriod('archivedAt') }) : null,
    caseView ? Task.countDocuments({ ...ctx.caseCond('case'), ...(can(req, 'tasks.view_all') ? {} : { assignee: req.staff._id }), ...inPeriod('completedAt') }) : null,
  ]);

  return {
    data: {
    snapshot: [
      metric('activeCases', 'Active cases', 'snapshot', activeCases, '/cases'),
      metric('openTasks', 'Open tasks', 'snapshot', openTasks, '/tasks'),
      metric('overdueTasks', 'Overdue tasks', 'snapshot', overdueTasks, '/tasks'),
      metric('unassignedTasks', 'Unassigned tasks', 'snapshot', unassignedTasks, '/tasks'),
      metric('documentsAwaitingReview', 'Documents awaiting review', 'snapshot', documentsAwaitingReview, '/work-queues'),
      metric('overdueDocumentRequests', 'Overdue document requests', 'snapshot', overdueDocumentRequests, '/work-queues'),
      metric('missingEvidence', 'Evidence still needed', 'snapshot', missingEvidence, '/work-queues'),
      metric('formsAwaitingReview', 'Forms awaiting review', 'snapshot', formsAwaitingReview, '/work-queues'),
      metric('petitionsAwaitingReview', 'Petitions awaiting review', 'snapshot', petitionsAwaitingReview, '/work-queues'),
      metric('packetsAwaitingReview', 'Filing packets awaiting review', 'snapshot', packetsAwaitingReview, '/work-queues'),
      metric('uscisActionRequired', 'USCIS action required', 'snapshot', uscisActionRequired, '/tracking'),
      metric('unansweredQueries', 'Unanswered queries', 'snapshot', unansweredQueries, '/consultations'),
    ],
    period: {
      from: ctx.range.from,
      to: ctx.range.to,
      metrics: [
        metric('casesOpened', 'Cases opened', 'period', casesOpened, '/cases'),
        metric('casesClosed', 'Cases closed (archived)', 'period', casesClosed, '/cases'),
        metric('tasksCompleted', 'Tasks completed', 'period', tasksCompleted, '/tasks'),
      ],
    },
    },
  };
}

module.exports = { run, countQueries };
