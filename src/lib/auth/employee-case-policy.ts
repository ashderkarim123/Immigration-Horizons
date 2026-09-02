import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseWorkspace } from "../models/CaseWorkspace";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { roleHasCapability } from "./capabilities";
import type { EmployeeActor } from "./actors";

/**
 * Row-level case access for employees (ADR-009 §4, extended in ADR-010 §2).
 *
 * Mirrors `server/services/casePolicy.js`'s two-layer rule exactly:
 *   1. the capability (`cases.view`), and
 *   2. either `cases.view_all` (org-wide) or an ACTIVE WorkspaceMember row.
 *
 * The Cycle 8B capability widening gave specialists and reviewer
 * `cases.view` but NOT `cases.view_all`, so for them layer 2 is always the
 * membership check — they see assigned cases and nothing else. That
 * property is what made the widening safe, and it is enforced here rather
 * than assumed.
 *
 * Cycle 8C adds filtering, pagination, and a workspace loader for the
 * staff console. Every one of them composes ON TOP of the restriction
 * below — a filter can only ever narrow the accessible set, never widen
 * it, because the restriction is intersected last and cannot be
 * overridden by a query parameter.
 */

/** Case ids this employee may see, or `null` meaning "no restriction" (view_all). */
export async function accessibleCaseIdFilter(
  actor: EmployeeActor,
): Promise<{ _id: { $in: mongoose.Types.ObjectId[] } } | null> {
  if (roleHasCapability(actor.role, "cases.view_all")) return null;
  return { _id: { $in: await memberCaseIds(actor) } };
}

/** Ids of cases this employee is personally an active member of. */
export async function memberCaseIds(actor: EmployeeActor): Promise<mongoose.Types.ObjectId[]> {
  const memberships = await WorkspaceMember.find({
    memberType: "employee",
    adminUser: actor.adminUserId,
    status: "active",
  })
    .select("workspace")
    .lean();

  if (memberships.length === 0) return [];

  const workspaces = await CaseWorkspace.find({
    _id: { $in: memberships.map((m) => m.workspace) },
  })
    .select("case")
    .lean();

  return workspaces.map((w) => w.case as mongoose.Types.ObjectId);
}

export const CASE_LIST_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type CaseListFilters = {
  /** Free text over case number and title. */
  search?: string;
  stage?: string;
  caseType?: string;
  priority?: string;
  /** "mine" = cases I am a member of; "unassigned" = no project manager. */
  scope?: "all" | "mine" | "unassigned";
  includeArchived?: boolean;
  page?: number;
  limit?: number;
};

export type CaseListResult = {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
};

const EMPTY_LIST: CaseListResult = {
  items: [],
  total: 0,
  page: 1,
  totalPages: 1,
  pageSize: CASE_LIST_PAGE_SIZE,
};

/** Escapes a user string so it is matched literally, never as a regex. */
function literalRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/**
 * Cases this employee can see, filtered and paginated. Fails closed: no
 * capability produces an empty result, never "all cases".
 */
export async function listCasesForEmployee(
  actor: EmployeeActor,
  filters: CaseListFilters = {},
): Promise<CaseListResult> {
  if (!roleHasCapability(actor.role, "cases.view")) return EMPTY_LIST;

  const db = getDb();
  if (!db) return EMPTY_LIST;
  await db;

  const pageSize = Math.min(Math.max(filters.limit ?? CASE_LIST_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(1, filters.page ?? 1);

  const query: Record<string, unknown> = {};

  if (!filters.includeArchived) query.archivedAt = null;
  if (filters.stage) query.currentStage = filters.stage;
  if (filters.caseType) query.caseType = filters.caseType;
  if (filters.priority) query.priority = filters.priority;

  if (filters.search) {
    const pattern = literalRegex(filters.search.trim());
    query.$or = [{ caseNumber: pattern }, { title: pattern }];
  }

  if (filters.scope === "unassigned") query.projectManager = null;

  // The row-level restriction is intersected LAST and always wins: it
  // narrows an id set already narrowed by "mine", or contributes nothing
  // when the role holds view_all.
  const idSets: mongoose.Types.ObjectId[][] = [];
  if (filters.scope === "mine") idSets.push(await memberCaseIds(actor));

  const restriction = await accessibleCaseIdFilter(actor);
  if (restriction) idSets.push(restriction._id.$in);

  if (idSets.length > 0) {
    const allowed = idSets.reduce((acc, next) => {
      const set = new Set(next.map(String));
      return acc.filter((id) => set.has(String(id)));
    });
    query._id = { $in: allowed };
  }

  const [items, total] = await Promise.all([
    ClientCase.find(query)
      .select(
        "caseNumber title caseType currentStage priority targetFilingDate projectManager primaryClient updatedAt archivedAt",
      )
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    ClientCase.countDocuments(query),
  ]);

  return {
    items: items as Record<string, unknown>[],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/**
 * Unpaginated list kept for the Cycle 8B dashboard, which needs a handful
 * of rows rather than a page object.
 */
export async function listAccessibleCasesForEmployee(
  actor: EmployeeActor,
  options: { includeArchived?: boolean; limit?: number } = {},
) {
  const result = await listCasesForEmployee(actor, {
    includeArchived: options.includeArchived,
    limit: options.limit ?? CASE_LIST_PAGE_SIZE,
  });
  return result.items;
}

/**
 * One case, if this employee may see it. Returns null — never throws and
 * never distinguishes "does not exist" from "not yours".
 */
export async function getAccessibleCaseForEmployee(caseId: string, actor: EmployeeActor) {
  const loaded = await getAccessibleCaseWorkspace(caseId, actor);
  return loaded ? loaded.caseDoc : null;
}

/**
 * The case AND its primary workspace together, subject to the same
 * row-level rule. Every case-scoped staff read and write starts here, so
 * the workspace a mutation touches is always the one the access check was
 * performed against — never one re-derived later from unvalidated input.
 */
export async function getAccessibleCaseWorkspace(caseId: string, actor: EmployeeActor) {
  if (!roleHasCapability(actor.role, "cases.view")) return null;
  if (!mongoose.Types.ObjectId.isValid(caseId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const caseDoc = await ClientCase.findById(caseId).lean();
  if (!caseDoc) return null;

  const workspace = await CaseWorkspace.findOne({
    case: caseDoc._id,
    workspaceType: "primary",
  }).lean();
  if (!workspace) return null;

  if (roleHasCapability(actor.role, "cases.view_all")) return { caseDoc, workspace };

  const membership = await WorkspaceMember.exists({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: actor.adminUserId,
    status: "active",
  });

  return membership ? { caseDoc, workspace } : null;
}

export type WorkspaceMemberRow = {
  id: string;
  memberType: "client" | "employee";
  workspaceRole: string;
  displayRole: string;
  status: string;
  clientVisible: boolean;
  name: string;
  email: string;
  /** Internal role code — employees only, and never sent to a client surface. */
  roleCode: string | null;
  isProjectManager: boolean;
  joinedAt: Date | null;
};

/**
 * Every member of a case workspace, employee and client alike, resolved to
 * display names.
 *
 * This is a STAFF serializer: it deliberately carries the internal role
 * code, which is exactly why it must never be reused on a client-facing
 * surface. `getClientVisibleTeam` in case-policy.ts stays the only
 * serializer the portal uses (ADR-009 §6).
 */
export async function listWorkspaceMembers(
  workspaceId: unknown,
  projectManagerId: unknown,
): Promise<WorkspaceMemberRow[]> {
  const { AdminUser } = await import("../models/AdminUser");
  const { ClientUser } = await import("../models/ClientUser");

  const members = await WorkspaceMember.find({
    workspace: workspaceId,
    status: { $ne: "removed" },
  })
    .sort({ memberType: 1, createdAt: 1 })
    .lean();

  const adminIds = members.filter((m) => m.memberType === "employee").map((m) => m.adminUser);
  const clientIds = members.filter((m) => m.memberType === "client").map((m) => m.clientUser);

  const [admins, clients] = await Promise.all([
    adminIds.length
      ? AdminUser.find({ _id: { $in: adminIds } }).select("name email role").lean()
      : [],
    clientIds.length
      ? ClientUser.find({ _id: { $in: clientIds } }).select("firstName lastName email").lean()
      : [],
  ]);

  const adminById = new Map(
    (admins as Record<string, unknown>[]).map((a) => [String(a._id), a]),
  );
  const clientById = new Map(
    (clients as Record<string, unknown>[]).map((c) => [String(c._id), c]),
  );

  return members.map((member) => {
    const isEmployee = member.memberType === "employee";
    const admin = isEmployee ? adminById.get(String(member.adminUser)) : undefined;
    const client = !isEmployee ? clientById.get(String(member.clientUser)) : undefined;

    const clientName = client
      ? [client.firstName, client.lastName].filter(Boolean).join(" ").trim()
      : "";

    return {
      id: String(member._id),
      memberType: member.memberType as "client" | "employee",
      workspaceRole: String(member.workspaceRole),
      displayRole: String(member.displayRole || ""),
      status: String(member.status),
      clientVisible: member.clientVisible !== false,
      name: isEmployee
        ? String(admin?.name || "Unknown team member")
        : clientName || String(client?.email || "Unknown client"),
      email: String((isEmployee ? admin?.email : client?.email) || ""),
      roleCode: isEmployee ? String(admin?.role || "") : null,
      isProjectManager: isEmployee && String(member.adminUser) === String(projectManagerId ?? ""),
      joinedAt: (member.joinedAt as Date | null) ?? null,
    };
  });
}
