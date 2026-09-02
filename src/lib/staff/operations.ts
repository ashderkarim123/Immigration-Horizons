import "server-only";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseDocument } from "../models/CaseDocument";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { ChannelReadState } from "../models/ChannelReadState";
import { Task } from "../models/Task";
import { roleHasCapability } from "../auth/capabilities";
import { accessibleCaseIdFilter } from "../auth/employee-case-policy";
import { ACTIVE_UNANSWERED_STATUSES } from "../content/interaction-constants";
import { organizationTimezone, todayBoundsInTimezone } from "../timezone";
import type { EmployeeActor } from "../auth/actors";

/**
 * The unified operations console (ADR-010 §7).
 *
 * This **aggregates the queue definitions that already exist** rather than
 * inventing new ones: the eight queues here have the same filters as
 * `server/services/operationsQueues.js` and `interactionQueues.js`, and
 * every one is backed by an index created in an earlier cycle. Nothing new
 * is indexed for this page.
 *
 * Three properties distinguish it from the admin CMS's dashboard, which is
 * org-wide and unscoped:
 *
 *  1. **Every queue is capability-gated.** A role without the governing
 *     capability gets `null`, which the UI renders as "not your remit" —
 *     never a zero, which would read as "all clear".
 *  2. **Every case-scoped queue is row-level scoped** through the same
 *     `accessibleCaseIdFilter` used for reads, so a specialist's queues
 *     cover their own cases, not the practice's.
 *  3. **Each queue carries its rows, not just a count.** A console you
 *     cannot act from is a report.
 */

/** A case untouched for this long needs a look. Mirrors STALLED_CASE_DAYS. */
const STALLED_CASE_DAYS = 21;
const QUEUE_LIMIT = 10;

export type QueueRow = {
  id: string;
  primary: string;
  secondary: string;
  href: string | null;
  /** Rendered as an urgency marker when set. */
  flag?: string;
};

export type Queue = {
  key: string;
  label: string;
  /** What a non-zero count means, and what to do about it. */
  hint: string;
  href: string | null;
  count: number;
  rows: QueueRow[];
};

export type OperationsBoard = {
  /** Queues this role can hold. Ordered most-urgent-first. */
  queues: Queue[];
  /** Queue labels the role has no capability for — shown honestly, not hidden. */
  unavailable: string[];
  scopedToMemberships: boolean;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function shortDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function truncate(value: unknown, max = 90): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Client-authored messages nobody on the team has read yet, restricted to
 * the given cases. Same definition as the admin CMS's own count (ADR-007
 * §5) — "nobody picked this up", not "I personally haven't read it".
 */
async function unreadClientConversations(caseIds: unknown[] | null) {
  const caseScope = caseIds ? { case: { $in: caseIds } } : {};
  const base: Record<string, unknown> = { senderType: "client", deletedAt: null, ...caseScope };

  const employeeMembers = await WorkspaceMember.find({ memberType: "employee", status: "active" })
    .select("_id")
    .lean();

  if (employeeMembers.length === 0) return base;

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

  return {
    ...base,
    $or: [{ channel: { $nin: readChannelIds } }, ...newerThanRead],
  };
}

const EMPTY_BOARD: OperationsBoard = { queues: [], unavailable: [], scopedToMemberships: true };

export async function getOperationsBoard(actor: EmployeeActor): Promise<OperationsBoard> {
  const db = getDb();
  if (!db) return EMPTY_BOARD;

  try {
    await db;

    const can = (capability: string) => roleHasCapability(actor.role, capability);
    const seesEverything = can("cases.view_all");

    const queues: Queue[] = [];
    const unavailable: string[] = [];

    const restriction = can("cases.view") ? await accessibleCaseIdFilter(actor) : { _id: { $in: [] } };
    const caseIds = restriction ? restriction._id.$in : null;
    const caseScope = caseIds ? { case: { $in: caseIds } } : {};
    const caseQueryScope = restriction ?? {};

    // --- Cases without a project manager -----------------------------------
    // A triage view: only meaningful for someone who can actually assign,
    // and org-wide by nature (an unassigned case has no workspace members
    // to scope it by, so a membership-scoped version would always be empty).
    if (can("cases.assign")) {
      const filter = {
        archivedAt: null,
        $or: [{ projectManager: null }, { projectManager: { $exists: false } }],
      };
      const [count, rows] = await Promise.all([
        ClientCase.countDocuments(filter),
        ClientCase.find(filter)
          .select("caseNumber title caseType openedAt")
          .sort({ openedAt: 1 })
          .limit(QUEUE_LIMIT)
          .lean(),
      ]);
      queues.push({
        key: "casesWithoutManager",
        label: "Cases without a manager",
        hint: "Nobody owns these yet — assign a project manager.",
        href: "/staff/cases?scope=unassigned",
        count,
        rows: rows.map((c) => ({
          id: String(c._id),
          primary: `${String(c.caseNumber)} — ${String(c.title)}`,
          secondary: `Opened ${shortDate(c.openedAt)}`,
          href: `/staff/cases/${c._id}`,
        })),
      });
    } else {
      unavailable.push("Cases without a manager");
    }

    // --- Documents awaiting review -----------------------------------------
    if (can("documents.view")) {
      const filter = {
        ...caseScope,
        status: { $in: ["uploaded", "pending_review"] },
        archivedAt: null,
      };
      const [count, rows] = await Promise.all([
        CaseDocument.countDocuments(filter),
        CaseDocument.find(filter)
          .select("displayName case uploadedAt status")
          .sort({ uploadedAt: 1 })
          .limit(QUEUE_LIMIT)
          .lean(),
      ]);
      queues.push({
        key: "documentsAwaitingReview",
        label: "Documents awaiting review",
        hint: "Uploaded by clients and not yet reviewed.",
        href: null,
        count,
        rows: rows.map((d) => ({
          id: String(d._id),
          primary: String(d.displayName),
          secondary: `Uploaded ${shortDate(d.uploadedAt)}`,
          href: `/staff/cases/${d.case}`,
        })),
      });
    } else {
      unavailable.push("Documents awaiting review");
    }

    // --- Queries ------------------------------------------------------------
    if (can("queries.view")) {
      const now = new Date();
      const { start, end } = todayBoundsInTimezone(organizationTimezone(), now);

      const unansweredFilter = { status: { $in: ACTIVE_UNANSWERED_STATUSES } };
      const overdueFilter = {
        status: { $in: ACTIVE_UNANSWERED_STATUSES },
        responseDueAt: { $ne: null, $lt: now },
      };
      const scheduledTodayFilter = {
        status: { $in: ["scheduled", "rescheduled"] },
        scheduledFor: { $gte: start, $lt: end },
      };

      const [overdueCount, overdueRows, unansweredCount, unansweredRows, todayCount, todayRows] =
        await Promise.all([
          ConsultationInteraction.countDocuments(overdueFilter),
          ConsultationInteraction.find(overdueFilter)
            .select("interactionNumber subject responseDueAt")
            .sort({ responseDueAt: 1 })
            .limit(QUEUE_LIMIT)
            .lean(),
          ConsultationInteraction.countDocuments(unansweredFilter),
          ConsultationInteraction.find(unansweredFilter)
            .select("interactionNumber subject status createdAt priority")
            .sort({ createdAt: 1 })
            .limit(QUEUE_LIMIT)
            .lean(),
          ConsultationInteraction.countDocuments(scheduledTodayFilter),
          ConsultationInteraction.find(scheduledTodayFilter)
            .select("interactionNumber subject scheduledFor timezone")
            .sort({ scheduledFor: 1 })
            .limit(QUEUE_LIMIT)
            .lean(),
        ]);

      queues.push({
        key: "overdueQueries",
        label: "Overdue queries",
        // Named honestly: nothing sets responseDueAt automatically yet
        // (no SLA rule is configured), so this stays empty until one is.
        hint: "Past their response-due date. Empty until a response SLA is configured.",
        href: "/staff/queries?queue=overdue",
        count: overdueCount,
        rows: overdueRows.map((q) => ({
          id: String(q._id),
          primary: truncate(q.subject),
          secondary: `${String(q.interactionNumber)} · due ${shortDate(q.responseDueAt)}`,
          href: null,
          flag: "Overdue",
        })),
      });

      queues.push({
        key: "unansweredQueries",
        label: "Unanswered queries",
        hint: "Client questions still waiting on us.",
        href: "/staff/queries?queue=unanswered",
        count: unansweredCount,
        rows: unansweredRows.map((q) => ({
          id: String(q._id),
          primary: truncate(q.subject),
          secondary: `${String(q.interactionNumber)} · raised ${shortDate(q.createdAt)}`,
          href: null,
          flag: q.priority === "urgent" || q.priority === "high" ? String(q.priority) : undefined,
        })),
      });

      queues.push({
        key: "scheduledToday",
        label: "Consultations today",
        hint: "Scheduled in the organization's timezone.",
        href: "/staff/queries?queue=scheduledToday",
        count: todayCount,
        rows: todayRows.map((q) => ({
          id: String(q._id),
          primary: truncate(q.subject),
          secondary: `${String(q.interactionNumber)} · ${new Date(q.scheduledFor as unknown as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          href: null,
        })),
      });
    } else {
      unavailable.push("Overdue queries", "Unanswered queries", "Consultations today");
    }

    // --- Unread client conversations ---------------------------------------
    if (can("channels.view") && can("cases.view")) {
      const filter = await unreadClientConversations(caseIds);
      const [count, rows] = await Promise.all([
        WorkspaceMessage.countDocuments(filter),
        WorkspaceMessage.find(filter)
          .select("body case senderDisplayName createdAt")
          .sort({ createdAt: 1 })
          .limit(QUEUE_LIMIT)
          .lean(),
      ]);
      queues.push({
        key: "unreadClientConversations",
        label: "Unread client messages",
        hint: "Nobody on the team has opened these yet.",
        href: null,
        count,
        rows: rows.map((m) => ({
          id: String(m._id),
          primary: truncate(m.body),
          secondary: `${String(m.senderDisplayName)} · ${shortDate(m.createdAt)}`,
          href: `/staff/cases/${m.case}`,
        })),
      });
    } else {
      unavailable.push("Unread client messages");
    }

    // --- Overdue tasks -------------------------------------------------------
    // Ownership is the scope, so this needs no capability: it can only
    // ever show work assigned to the signed-in employee.
    {
      const filter = {
        assignee: actor.adminUserId,
        status: { $ne: "completed" },
        dueDate: { $ne: null, $lt: new Date() },
      };
      const [count, rows] = await Promise.all([
        Task.countDocuments(filter),
        Task.find(filter).select("title type dueDate status").sort({ dueDate: 1 }).limit(QUEUE_LIMIT).lean(),
      ]);
      queues.push({
        key: "overdueTasks",
        label: "Your overdue tasks",
        hint: "Assigned to you and past the due date.",
        href: "/staff/tasks",
        count,
        rows: rows.map((t) => ({
          id: String(t._id),
          primary: String(t.title),
          secondary: `${String(t.type)} · due ${shortDate(t.dueDate)}`,
          href: "/staff/tasks",
          flag: "Overdue",
        })),
      });
    }

    // --- Cases needing operational attention ---------------------------------
    if (can("cases.view")) {
      const filter = {
        ...caseQueryScope,
        archivedAt: null,
        updatedAt: { $lt: daysAgo(STALLED_CASE_DAYS) },
      };
      const [count, rows] = await Promise.all([
        ClientCase.countDocuments(filter),
        ClientCase.find(filter)
          .select("caseNumber title currentStage updatedAt")
          .sort({ updatedAt: 1 })
          .limit(QUEUE_LIMIT)
          .lean(),
      ]);
      queues.push({
        key: "stalledCases",
        label: "Cases needing attention",
        hint: `No recorded change in ${STALLED_CASE_DAYS} days.`,
        href: "/staff/cases",
        count,
        rows: rows.map((c) => ({
          id: String(c._id),
          primary: `${String(c.caseNumber)} — ${String(c.title)}`,
          secondary: `${String(c.currentStage).replace(/_/g, " ")} · last change ${shortDate(c.updatedAt)}`,
          href: `/staff/cases/${c._id}`,
        })),
      });
    } else {
      unavailable.push("Cases needing attention");
    }

    return { queues, unavailable, scopedToMemberships: !seesEverything };
  } catch (err) {
    // An operations board is not worth a 500 — same posture as the admin
    // CMS's operational counts (ADR-007 §4).
    console.error("[staff-operations] Failed to compute the operations board:", (err as Error).message);
    return EMPTY_BOARD;
  }
}

export { STALLED_CASE_DAYS };
