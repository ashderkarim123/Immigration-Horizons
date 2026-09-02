import "server-only";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseDocument } from "../models/CaseDocument";
import { DocumentRequest } from "../models/DocumentRequest";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { ChannelReadState } from "../models/ChannelReadState";
import { Task } from "../models/Task";
import { accessibleCaseIdFilter } from "../auth/employee-case-policy";
import { roleHasCapability } from "../auth/capabilities";
import { queryScopeFilter } from "../staff/query-queues";
import { ACTIVE_UNANSWERED_STATUSES } from "../content/interaction-constants";
import type { EmployeeActor } from "../auth/actors";

/**
 * Dashboard data for the employee SaaS app (ADR-009 §5).
 *
 * One module, capability-gated — deliberately NOT three per-role query
 * files. The brief's three role dashboards differ in which widgets they
 * show and in what order, not in what a "case awaiting review" means. So
 * every widget is computed once here, gated by the capability that governs
 * it, and the role presets in `dashboard-presets.ts` choose the layout.
 *
 * Every case-scoped count is scoped through `accessibleCaseIdFilter`, the
 * same row-level rule `employee-case-policy.ts` uses for reads — a
 * specialist's "documents awaiting review" counts only their own cases,
 * not the firm's.
 *
 * A widget the role cannot hold returns `null` (not `0`), so the UI can
 * distinguish "nothing waiting" from "not your remit" and render an
 * honest state for each.
 */

export type WidgetValue = number | null;

export type EmployeeDashboardData = {
  role: string;
  /** Cases the employee can actually open. */
  myCases: WidgetValue;
  /** Active cases with no project manager — managers only. */
  unassignedCases: WidgetValue;
  /** Cases whose target filing date is inside 30 days. */
  upcomingDeadlines: WidgetValue;
  /** Documents uploaded/pending review on accessible cases. */
  documentsAwaitingReview: WidgetValue;
  /** Open document requests already past their due date. */
  overdueDocumentRequests: WidgetValue;
  /** Client questions not yet answered. */
  unansweredQueries: WidgetValue;
  /** Consultations still needing a slot. */
  queriesAwaitingScheduling: WidgetValue;
  /** Client messages nobody on the team has read yet, on accessible cases. */
  unreadClientMessages: WidgetValue;
  /** Tasks assigned to this employee and not completed. */
  myOpenTasks: WidgetValue;
  /** Assigned tasks already past their due date. */
  myOverdueTasks: WidgetValue;
};

const UPCOMING_DEADLINE_DAYS = 30;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Client messages on the given cases that no employee has read yet.
 * Same definition as the admin CMS's `countUnreadClientMessages` (ADR-007
 * §5) — "nobody picked this up", not "I personally haven't read it".
 */
async function countUnreadClientMessages(caseFilter: Record<string, unknown> | null): Promise<number> {
  const caseScope = caseFilter ? { case: (caseFilter as { _id: { $in: unknown[] } })._id } : {};

  const employeeMembers = await WorkspaceMember.find({ memberType: "employee", status: "active" })
    .select("_id")
    .lean();

  const base: Record<string, unknown> = { senderType: "client", deletedAt: null, ...caseScope };

  if (employeeMembers.length === 0) return WorkspaceMessage.countDocuments(base);

  const readStates = await ChannelReadState.find({
    workspaceMember: { $in: employeeMembers.map((m) => m._id) },
  })
    .select("channel lastReadAt")
    .lean();

  const newestByChannel = new Map<string, Date>();
  for (const state of readStates) {
    const lastReadAt = (state as { lastReadAt?: Date }).lastReadAt;
    if (!lastReadAt) continue;
    const key = String((state as { channel: unknown }).channel);
    const current = newestByChannel.get(key);
    if (!current || lastReadAt > current) newestByChannel.set(key, lastReadAt);
  }

  const readChannelIds = [...newestByChannel.keys()];
  const newerThanRead = [...newestByChannel.entries()].map(([channel, lastReadAt]) => ({
    channel,
    createdAt: { $gt: lastReadAt },
  }));

  return WorkspaceMessage.countDocuments({
    ...base,
    $or: [{ channel: { $nin: readChannelIds } }, ...newerThanRead],
  });
}

export async function getEmployeeDashboard(actor: EmployeeActor): Promise<EmployeeDashboardData> {
  const empty: EmployeeDashboardData = {
    role: actor.role,
    myCases: null,
    unassignedCases: null,
    upcomingDeadlines: null,
    documentsAwaitingReview: null,
    overdueDocumentRequests: null,
    unansweredQueries: null,
    queriesAwaitingScheduling: null,
    unreadClientMessages: null,
    myOpenTasks: null,
    myOverdueTasks: null,
  };

  const db = getDb();
  if (!db) return empty;

  try {
    await db;

    const can = (capability: string) => roleHasCapability(actor.role, capability);
    const canSeeCases = can("cases.view");
    const canSeeDocuments = can("documents.view");
    const canSeeQueries = can("queries.view");
    const canSeeChannels = can("channels.view");

    // Computed once and reused by every case-scoped widget below.
    const caseFilter = canSeeCases ? await accessibleCaseIdFilter(actor) : { _id: { $in: [] } };
    const caseScope = caseFilter ?? {};
    const caseIdScope = caseFilter
      ? { case: (caseFilter as { _id: { $in: unknown[] } })._id }
      : {};

    // Query counts are row-level scoped exactly like the /staff/queries
    // queues (ADR-010 §8), so a tile and the queue it links to can never
    // disagree about how much work is waiting. `null` = queries.view_all.
    const queryScope = canSeeQueries ? await queryScopeFilter(actor) : { _id: { $in: [] } };
    const scopedQuery = (filter: Record<string, unknown>) =>
      queryScope ? { $and: [filter, queryScope] } : filter;

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

      // "Unassigned" is a triage view — only meaningful for someone who can
      // actually assign, and org-wide by nature.
      can("cases.assign") || can("cases.view_all")
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
            status: { $in: ["uploaded", "pending_review"] },
            archivedAt: null,
          })
        : Promise.resolve(null),

      canSeeDocuments
        ? DocumentRequest.countDocuments({
            ...caseIdScope,
            status: "open",
            dueDate: { $ne: null, $lt: new Date() },
          })
        : Promise.resolve(null),

      canSeeQueries
        ? ConsultationInteraction.countDocuments(
            scopedQuery({ status: { $in: ACTIVE_UNANSWERED_STATUSES } }),
          )
        : Promise.resolve(null),

      canSeeQueries
        ? ConsultationInteraction.countDocuments(
            scopedQuery({
              type: "scheduled_consultation",
              scheduledFor: null,
              status: { $in: ACTIVE_UNANSWERED_STATUSES },
            }),
          )
        : Promise.resolve(null),

      canSeeChannels && canSeeCases ? countUnreadClientMessages(caseFilter) : Promise.resolve(null),

      Task.countDocuments({ assignee: actor.adminUserId, status: { $ne: "completed" } }),
      Task.countDocuments({
        assignee: actor.adminUserId,
        status: { $ne: "completed" },
        dueDate: { $ne: null, $lt: new Date() },
      }),
    ]);

    return {
      role: actor.role,
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
    };
  } catch (err) {
    // A dashboard is not worth a 500 — same posture as the admin CMS's
    // operational counts (ADR-007 §4).
    console.error("[staff-dashboard] Failed to compute dashboard data:", (err as Error).message);
    return empty;
  }
}

/** Cases to list under the dashboard, already row-level scoped. */
export async function getDashboardCases(actor: EmployeeActor, limit = 8) {
  if (!roleHasCapability(actor.role, "cases.view")) return [];
  const db = getDb();
  if (!db) return [];
  await db;

  const caseFilter = await accessibleCaseIdFilter(actor);
  return ClientCase.find({ ...(caseFilter ?? {}), archivedAt: null })
    .select("caseNumber title caseType currentStage priority targetFilingDate updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

/** This employee's own open tasks — always available; ownership is the scope. */
export async function getMyTasks(actor: EmployeeActor, limit = 8) {
  const db = getDb();
  if (!db) return [];
  await db;

  return Task.find({ assignee: actor.adminUserId, status: { $ne: "completed" } })
    .select("title type status priority dueDate lead")
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(limit)
    .lean();
}
