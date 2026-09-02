import "server-only";

import { getDb } from "../db";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { ClientUser } from "../models/ClientUser";
import { AdminUser } from "../models/AdminUser";
import { roleHasCapability } from "../auth/capabilities";
import { accessibleCaseIdFilter } from "../auth/employee-case-policy";
import { ACTIVE_UNANSWERED_STATUSES } from "../content/interaction-constants";
import { organizationTimezone, todayBoundsInTimezone } from "../timezone";
import type { EmployeeActor } from "../auth/actors";

/**
 * Query queues for the staff console (ADR-010 §8).
 *
 * The queue *definitions* mirror `server/services/interactionQueues.js`
 * exactly — same filters, same sorts, same names — so "unanswered" means
 * one thing across both applications.
 *
 * What differs is the scope. The admin CMS's queues are org-wide because
 * every route reaching them is already manager-tier. Here the queue is
 * additionally narrowed by `queryScopeFilter` below for any role without
 * `queries.view_all`, so a PM sees consultation-scoped queries (which
 * belong to no workspace) plus case-scoped ones on cases they can
 * actually open — never another team's.
 */

const QUEUE_LIMIT = 50;

export const QUERY_QUEUES = [
  { key: "unanswered", label: "Unanswered", hint: "Still waiting on us." },
  { key: "unassigned", label: "Unassigned", hint: "Open and nobody owns them." },
  { key: "awaitingScheduling", label: "Awaiting scheduling", hint: "Consultations that still need a slot." },
  { key: "scheduledToday", label: "Scheduled today", hint: "In the organization's timezone." },
  { key: "overdueResponse", label: "Overdue", hint: "Past their response-due date." },
  { key: "awaitingClient", label: "Awaiting client", hint: "We answered; the client has not replied." },
  { key: "noShowFollowUp", label: "No-show follow-up", hint: "Missed consultations to reschedule." },
  { key: "recentlyAnswered", label: "Recently answered", hint: "Closed out in the last pass." },
] as const;

export type QueryQueueKey = (typeof QUERY_QUEUES)[number]["key"];

export function isQueryQueueKey(value: unknown): value is QueryQueueKey {
  return QUERY_QUEUES.some((q) => q.key === value);
}

function queueFilter(key: QueryQueueKey, now: Date): Record<string, unknown> {
  switch (key) {
    case "unanswered":
      return { status: { $in: ACTIVE_UNANSWERED_STATUSES } };
    case "unassigned":
      return { status: { $in: ACTIVE_UNANSWERED_STATUSES }, assignedTo: null };
    case "awaitingScheduling":
      return { status: { $in: ["submitted", "acknowledged"] }, scheduledFor: null };
    case "scheduledToday": {
      const { start, end } = todayBoundsInTimezone(organizationTimezone(), now);
      return { status: { $in: ["scheduled", "rescheduled"] }, scheduledFor: { $gte: start, $lt: end } };
    }
    case "overdueResponse":
      return { status: { $in: ACTIVE_UNANSWERED_STATUSES }, responseDueAt: { $ne: null, $lt: now } };
    case "awaitingClient":
      return { status: "awaiting_client" };
    case "noShowFollowUp":
      return { status: "no_show" };
    case "recentlyAnswered":
      return { status: "answered" };
  }
}

const QUEUE_SORTS: Record<QueryQueueKey, Record<string, 1 | -1>> = {
  unanswered: { createdAt: -1 },
  unassigned: { createdAt: -1 },
  awaitingScheduling: { createdAt: -1 },
  scheduledToday: { scheduledFor: 1 },
  overdueResponse: { responseDueAt: 1 },
  awaitingClient: { updatedAt: -1 },
  noShowFollowUp: { updatedAt: -1 },
  recentlyAnswered: { answeredAt: -1 },
};

/**
 * The row-level narrowing every query read composes with.
 *
 * `null` means no restriction (the role holds `queries.view_all`).
 * Otherwise: consultation-scoped queries have no workspace to check and
 * stay visible; case-scoped ones are limited to cases this employee can
 * open. A role holding `queries.view` but not `cases.view` therefore sees
 * consultation-scoped queries only, which is the correct reading of two
 * independent capabilities.
 */
export async function queryScopeFilter(
  actor: EmployeeActor,
): Promise<Record<string, unknown> | null> {
  if (roleHasCapability(actor.role, "queries.view_all")) return null;

  const restriction = roleHasCapability(actor.role, "cases.view")
    ? await accessibleCaseIdFilter(actor)
    : { _id: { $in: [] } };

  // A view_all case role that somehow lacks queries.view_all still gets
  // every case-scoped query, which is consistent: the case scope is what
  // is being checked, not the query capability a second time.
  if (restriction === null) return null;

  return { $or: [{ scopeType: "consultation" }, { case: { $in: restriction._id.$in } }] };
}

export type QueryRow = {
  id: string;
  interactionNumber: string;
  subject: string;
  type: string;
  status: string;
  priority: string;
  scopeType: string;
  caseId: string | null;
  clientName: string;
  assigneeName: string | null;
  scheduledFor: Date | null;
  createdAt: Date | null;
};

export type QueryQueueResult = {
  rows: QueryRow[];
  counts: Record<string, number>;
};

const EMPTY: QueryQueueResult = { rows: [], counts: {} };

/** One queue's rows plus every queue's count, for the sidebar. */
export async function getQueryQueue(
  actor: EmployeeActor,
  key: QueryQueueKey,
): Promise<QueryQueueResult> {
  if (!roleHasCapability(actor.role, "queries.view")) return EMPTY;

  const db = getDb();
  if (!db) return EMPTY;
  await db;

  const now = new Date();
  const scope = await queryScopeFilter(actor);

  // The scope uses $or, and so may a queue filter; $and keeps them from
  // overwriting each other into a wider query than either intended.
  const withScope = (filter: Record<string, unknown>) =>
    scope ? { $and: [filter, scope] } : filter;

  const [rows, ...counts] = await Promise.all([
    ConsultationInteraction.find(withScope(queueFilter(key, now)))
      .select(
        "interactionNumber subject type status priority scopeType case clientUser assignedTo scheduledFor createdAt",
      )
      .sort(QUEUE_SORTS[key])
      .limit(QUEUE_LIMIT)
      .lean(),
    ...QUERY_QUEUES.map((queue) =>
      ConsultationInteraction.countDocuments(withScope(queueFilter(queue.key, now))),
    ),
  ]);

  const records = rows as Record<string, unknown>[];

  const clientIds = [...new Set(records.map((r) => String(r.clientUser)).filter(Boolean))];
  const assigneeIds = [...new Set(records.map((r) => String(r.assignedTo ?? "")).filter(Boolean))];

  const [clients, assignees] = await Promise.all([
    clientIds.length
      ? ClientUser.find({ _id: { $in: clientIds } }).select("firstName lastName email").lean()
      : [],
    assigneeIds.length ? AdminUser.find({ _id: { $in: assigneeIds } }).select("name").lean() : [],
  ]);

  const clientById = new Map(
    (clients as Record<string, unknown>[]).map((c) => [
      String(c._id),
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || String(c.email || ""),
    ]),
  );
  const assigneeById = new Map(
    (assignees as Record<string, unknown>[]).map((a) => [String(a._id), String(a.name)]),
  );

  return {
    rows: records.map((row) => ({
      id: String(row._id),
      interactionNumber: String(row.interactionNumber),
      subject: String(row.subject),
      type: String(row.type),
      status: String(row.status),
      priority: String(row.priority),
      scopeType: String(row.scopeType),
      caseId: row.case ? String(row.case) : null,
      clientName: clientById.get(String(row.clientUser)) ?? "Unknown client",
      assigneeName: row.assignedTo ? (assigneeById.get(String(row.assignedTo)) ?? null) : null,
      scheduledFor: (row.scheduledFor as Date | null) ?? null,
      createdAt: (row.createdAt as Date | null) ?? null,
    })),
    counts: Object.fromEntries(QUERY_QUEUES.map((queue, index) => [queue.key, counts[index] as number])),
  };
}
