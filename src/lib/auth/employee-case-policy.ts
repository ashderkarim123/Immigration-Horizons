import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseWorkspace } from "../models/CaseWorkspace";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { roleHasCapability } from "./capabilities";
import type { EmployeeActor } from "./actors";

/**
 * Row-level case access for employees (ADR-009 §4).
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
 */

/** Case ids this employee may see, or `null` meaning "no restriction" (view_all). */
export async function accessibleCaseIdFilter(
  actor: EmployeeActor,
): Promise<{ _id: { $in: mongoose.Types.ObjectId[] } } | null> {
  if (roleHasCapability(actor.role, "cases.view_all")) return null;

  const memberships = await WorkspaceMember.find({
    memberType: "employee",
    adminUser: actor.adminUserId,
    status: "active",
  })
    .select("workspace")
    .lean();

  if (memberships.length === 0) return { _id: { $in: [] } };

  const workspaces = await CaseWorkspace.find({
    _id: { $in: memberships.map((m) => m.workspace) },
  })
    .select("case")
    .lean();

  return { _id: { $in: workspaces.map((w) => w.case) } };
}

/**
 * Cases this employee can see. Fails closed: no capability → empty list,
 * never "all cases".
 */
export async function listAccessibleCasesForEmployee(
  actor: EmployeeActor,
  options: { includeArchived?: boolean; limit?: number } = {},
) {
  if (!roleHasCapability(actor.role, "cases.view")) return [];

  const db = getDb();
  if (!db) return [];
  await db;

  const filter: Record<string, unknown> = {};
  const restriction = await accessibleCaseIdFilter(actor);
  if (restriction) Object.assign(filter, restriction);
  if (!options.includeArchived) filter.archivedAt = null;

  return ClientCase.find(filter)
    .select("caseNumber title caseType currentStage priority targetFilingDate projectManager primaryClient updatedAt archivedAt")
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(options.limit ?? 25, 1), 100))
    .lean();
}

/**
 * One case, if this employee may see it. Returns null — never throws and
 * never distinguishes "does not exist" from "not yours".
 */
export async function getAccessibleCaseForEmployee(caseId: string, actor: EmployeeActor) {
  if (!roleHasCapability(actor.role, "cases.view")) return null;
  if (!mongoose.Types.ObjectId.isValid(caseId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const caseDoc = await ClientCase.findById(caseId).lean();
  if (!caseDoc) return null;

  if (roleHasCapability(actor.role, "cases.view_all")) return caseDoc;

  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: "primary" })
    .select("_id")
    .lean();
  if (!workspace) return null;

  const membership = await WorkspaceMember.exists({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: actor.adminUserId,
    status: "active",
  });

  return membership ? caseDoc : null;
}
