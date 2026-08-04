const ConsultationInteraction = require('../models/ConsultationInteraction');
const { ACTIVE_UNANSWERED_STATUSES } = require('../utils/interactionConstants');
const { organizationTimezone, todayBoundsInTimezone } = require('../utils/timezone');

/**
 * Centralized, indexed, bounded queue definitions (module doc §19) — every
 * admin route/view that needs one of these calls the same function here,
 * rather than each duplicating its own query shape.
 *
 * `responseDueAt` is a real schema field but nothing in this cycle sets it
 * automatically — the module document explicitly says not to hardcode an
 * SLA without a configured business rule, and none exists yet. The
 * "Overdue response" queue is fully correct and indexed; it will simply
 * stay empty until a future cycle defines and sets that field.
 */

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 20;

function clampLimit(limit) {
  const n = parseInt(limit, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, n);
}

async function paginate(filter, sort, page, limit) {
  const safeLimit = clampLimit(limit);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const [items, total] = await Promise.all([
    ConsultationInteraction.find(filter)
      .populate('clientUser', 'email firstName lastName')
      .populate('assignedTo', 'name')
      .sort(sort)
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    ConsultationInteraction.countDocuments(filter),
  ]);
  return { items, total, page: safePage, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}

function unansweredFilter() {
  return { status: { $in: ACTIVE_UNANSWERED_STATUSES } };
}

function unassignedFilter() {
  return { status: { $in: ACTIVE_UNANSWERED_STATUSES }, assignedTo: null };
}

function awaitingSchedulingFilter() {
  return { status: { $in: ['submitted', 'acknowledged'] }, scheduledFor: null };
}

function scheduledTodayFilter(timezone = organizationTimezone(), now = new Date()) {
  const { start, end } = todayBoundsInTimezone(timezone, now);
  return {
    status: { $in: ['scheduled', 'rescheduled'] },
    scheduledFor: { $gte: start, $lt: end },
  };
}

function overdueResponseFilter(now = new Date()) {
  return { status: { $in: ACTIVE_UNANSWERED_STATUSES }, responseDueAt: { $lt: now } };
}

function awaitingClientFilter() {
  return { status: 'awaiting_client' };
}

function noShowFollowUpFilter() {
  return { status: 'no_show' };
}

function recentlyAnsweredFilter() {
  return { status: 'answered' };
}

const QUEUES = {
  unanswered: { filter: unansweredFilter, sort: { createdAt: -1 } },
  unassigned: { filter: unassignedFilter, sort: { createdAt: -1 } },
  awaitingScheduling: { filter: awaitingSchedulingFilter, sort: { createdAt: -1 } },
  scheduledToday: { filter: scheduledTodayFilter, sort: { scheduledFor: 1 } },
  overdueResponse: { filter: overdueResponseFilter, sort: { responseDueAt: 1 } },
  awaitingClient: { filter: awaitingClientFilter, sort: { updatedAt: -1 } },
  noShowFollowUp: { filter: noShowFollowUpFilter, sort: { updatedAt: -1 } },
  recentlyAnswered: { filter: recentlyAnsweredFilter, sort: { answeredAt: -1 } },
};

async function loadQueue(name, { page, limit } = {}) {
  const def = QUEUES[name];
  if (!def) throw new Error(`Unknown queue: ${name}`);
  return paginate(def.filter(), def.sort, page, limit);
}

/** Cheap counts for the admin dashboard/query-index sidebar — one countDocuments per queue, not a full fetch. */
async function queueCounts() {
  const entries = Object.entries(QUEUES);
  const counts = await Promise.all(entries.map(([, def]) => ConsultationInteraction.countDocuments(def.filter())));
  return Object.fromEntries(entries.map(([name], i) => [name, counts[i]]));
}

module.exports = {
  QUEUES,
  loadQueue,
  queueCounts,
  unansweredFilter,
  unassignedFilter,
  awaitingSchedulingFilter,
  scheduledTodayFilter,
  overdueResponseFilter,
  awaitingClientFilter,
  noShowFollowUpFilter,
  recentlyAnsweredFilter,
};
