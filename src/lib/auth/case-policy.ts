import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseWorkspace } from "../models/CaseWorkspace";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { AdminUser } from "../models/AdminUser";
import { clientDisplayRoleLabel } from "../content/case-constants";

const MAX_RESULTS = 50;

/**
 * Row-level case access for the client portal (ADR-002 §1: this app only
 * ever reads these collections). The authorization boundary is an active
 * `WorkspaceMember` — never `ClientCase.primaryClient` alone (module doc
 * §13: "Do not authorize a client solely because primaryClient matches").
 */

export async function listAccessibleCases(clientUserId: string) {
  const db = getDb();
  if (!db) return [];
  await db;

  const workspaceIds = await WorkspaceMember.distinct("workspace", {
    clientUser: clientUserId,
    memberType: "client",
    status: "active",
  });
  if (!workspaceIds.length) return [];

  const workspaces = await CaseWorkspace.find({ _id: { $in: workspaceIds } })
    .select("case")
    .lean();
  const caseIds = workspaces.map((w) => w.case);

  return ClientCase.find({ _id: { $in: caseIds } })
    .sort({ createdAt: -1 })
    .limit(MAX_RESULTS)
    .lean();
}

/**
 * Returns the case + its primary workspace only when `clientUserId` holds
 * an active client membership for it — otherwise null, identically for "no
 * such case" and "not your case" (module doc §"Information-disclosure
 * behavior"), so the page can call Next.js's `notFound()` either way.
 */
export async function getAccessibleCase(caseId: string, clientUserId: string) {
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

  const membership = await WorkspaceMember.findOne({
    workspace: workspace._id,
    clientUser: clientUserId,
    memberType: "client",
    status: "active",
  }).lean();
  if (!membership) return null;

  return { caseDoc, workspace };
}

export type ClientVisibleTeamMember = {
  id: string;
  name: string;
  displayRole: string;
};

/**
 * Only active, client-visible, still-eligible employee memberships — never
 * removed/suspended members, never internal role codes (module doc
 * §"Portal team page").
 */
export async function getClientVisibleTeam(
  workspaceId: string,
): Promise<ClientVisibleTeamMember[]> {
  const db = getDb();
  if (!db) return [];
  await db;

  const members = await WorkspaceMember.find({
    workspace: workspaceId,
    memberType: "employee",
    status: "active",
    clientVisible: true,
  }).lean();
  if (!members.length) return [];

  const adminUserIds = members.map((m) => m.adminUser).filter(Boolean);
  const adminUsers = await AdminUser.find({ _id: { $in: adminUserIds }, isActive: true })
    .select("name")
    .lean();
  const nameById = new Map(adminUsers.map((u) => [String(u._id), u.name]));

  return members
    .filter((m) => nameById.has(String(m.adminUser)))
    .map((m) => ({
      id: String(m._id),
      name: nameById.get(String(m.adminUser))!,
      displayRole: m.displayRole || clientDisplayRoleLabel(m.workspaceRole),
    }));
}
