import "server-only";

import { WorkspaceMember } from "../models/WorkspaceMember";

/**
 * Mirror of server/services/workspaceMembership.js (ADR-010 §3).
 *
 * The single write path for memberships in this app, so "adding the same
 * person back finds and reactivates the existing row" holds everywhere
 * rather than only in the callers that remember to check first.
 *
 * Upsert on the (workspace, identity) unique index makes this idempotent:
 * calling it twice with the same workspace + identity is safe.
 */
export async function addOrReactivateMember(params: {
  workspace: unknown;
  memberType: "client" | "employee";
  clientUser?: unknown;
  adminUser?: unknown;
  workspaceRole: string;
  status?: string;
  clientVisible?: boolean;
  displayRole?: string;
  invitedBy?: unknown;
  invitedByName?: string;
}) {
  const identityFilter =
    params.memberType === "client"
      ? { workspace: params.workspace, clientUser: params.clientUser }
      : { workspace: params.workspace, adminUser: params.adminUser };

  const now = new Date();
  const status = params.status || "active";

  const update = {
    $set: {
      memberType: params.memberType,
      workspaceRole: params.workspaceRole,
      status,
      invitedBy: params.invitedBy ?? null,
      invitedByName: params.invitedByName || "",
      // Always a real AdminUser here — the SaaS app has no env-credential
      // fallback login (ADR-009 §3).
      invitedByType: "admin_user",
      removedAt: null,
      ...(status === "active" ? { joinedAt: now } : {}),
      ...(params.clientVisible !== undefined ? { clientVisible: params.clientVisible } : {}),
      ...(params.displayRole !== undefined ? { displayRole: params.displayRole } : {}),
    },
    $setOnInsert: {
      workspace: params.workspace,
      ...(params.memberType === "client"
        ? { clientUser: params.clientUser }
        : { adminUser: params.adminUser }),
    },
  };

  return WorkspaceMember.findOneAndUpdate(identityFilter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
}

/**
 * Soft-removes a member — status/removedAt only, never a hard delete.
 * Access ends immediately because every authorization check reads
 * `status === 'active'` directly, with no cache to expire.
 */
export async function removeMember(memberId: unknown) {
  return WorkspaceMember.findByIdAndUpdate(
    memberId,
    { $set: { status: "removed", removedAt: new Date() } },
    { new: true },
  );
}
