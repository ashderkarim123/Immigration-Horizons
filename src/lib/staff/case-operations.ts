import "server-only";

import mongoose from "mongoose";

import { ClientCase } from "../models/ClientCase";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { AdminUser } from "../models/AdminUser";
import { recordCaseActivity } from "../models/CaseActivity";
import { notifyEmployee } from "../notifications/notification-service";
import { CASE_STAGE_VALUES, CLIENT_STAGE_LABELS, WORKSPACE_ROLES, type CaseStage } from "../content/case-constants";
import { addOrReactivateMember, removeMember } from "./workspace-membership";
import { emitCaseStageChangedMessage, emitMemberAddedMessage } from "./system-messages";

/**
 * Staff case mutations (ADR-010 §3).
 *
 * These mirror `server/services/caseManagement.js` decision for decision —
 * the same validation, the same "a former PM becomes a contributor rather
 * than losing access" rule, the same refusal to remove the primary client
 * or a sitting project manager, the same activity entries, the same
 * notifications, the same system messages. Two applications now write this
 * domain, so they must agree on what each action *means*, not merely on
 * the schema.
 *
 * Authorization is NOT performed here. Every caller is a route handler
 * that has already established the actor, their capability, and their
 * row-level access to this specific case via
 * `getAccessibleCaseWorkspace`. Keeping the checks in the route and the
 * semantics here means a mutation cannot be reached without passing both,
 * and this module stays directly unit-testable.
 */

export type OperationActor = { id: unknown; name: string };

export type OperationResult =
  | { outcome: "updated" | "archived" | "removed" }
  | { outcome: "added"; memberId: string }
  | { outcome: "unchanged" }
  | { outcome: "not_found" }
  | { outcome: "validation_error"; message: string };

/** Stage update. A no-op stage change records no duplicate audit entry. */
export async function updateCaseStage(params: {
  caseDoc: Record<string, unknown>;
  workspace: Record<string, unknown>;
  newStage: string;
  actor: OperationActor;
}): Promise<OperationResult> {
  const { caseDoc, workspace, newStage, actor } = params;

  if (!(CASE_STAGE_VALUES as string[]).includes(newStage)) {
    return { outcome: "validation_error", message: "That is not a valid case stage." };
  }
  if (caseDoc.currentStage === newStage) return { outcome: "unchanged" };

  const previousStage = String(caseDoc.currentStage);

  const updated = await ClientCase.findByIdAndUpdate(
    caseDoc._id,
    { $set: { currentStage: newStage } },
    { new: true },
  );
  if (!updated) return { outcome: "not_found" };

  await recordCaseActivity({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: "stage_changed",
    message: `Stage changed from "${previousStage}" to "${newStage}" by ${actor.name}.`,
    actor,
    meta: { previousStage, newStage },
  });

  await emitCaseStageChangedMessage({
    workspaceId: workspace._id,
    caseId: caseDoc._id,
    clientStageLabel: CLIENT_STAGE_LABELS[newStage as CaseStage] || newStage,
    changedAtIso: (updated.updatedAt instanceof Date ? updated.updatedAt : new Date()).toISOString(),
  });

  return { outcome: "updated" };
}

/**
 * Changes the project manager.
 *
 * Guarantees the new manager holds an active `project_manager` membership,
 * and demotes the previous manager to `contributor` rather than removing
 * them — a former PM keeps case access as a regular team member, because
 * removal is a separate, explicit action. Two people never simultaneously
 * hold the `project_manager` workspace role.
 */
export async function changeProjectManager(params: {
  caseDoc: Record<string, unknown>;
  workspace: Record<string, unknown>;
  newManagerId: string;
  actor: OperationActor;
}): Promise<OperationResult> {
  const { caseDoc, workspace, newManagerId, actor } = params;

  if (!mongoose.Types.ObjectId.isValid(newManagerId)) {
    return { outcome: "validation_error", message: "That is not a valid team member." };
  }

  const newManager = await AdminUser.findOne({ _id: newManagerId, isActive: true })
    .select("name")
    .lean();
  if (!newManager) {
    return { outcome: "validation_error", message: "Not a valid, active team member." };
  }

  const manager = newManager as Record<string, unknown>;
  if (String(caseDoc.projectManager ?? "") === String(manager._id)) {
    return { outcome: "unchanged" };
  }

  const previousManagerId = caseDoc.projectManager ?? null;

  const updated = await ClientCase.findByIdAndUpdate(
    caseDoc._id,
    { $set: { projectManager: manager._id } },
    { new: true },
  );
  if (!updated) return { outcome: "not_found" };

  await addOrReactivateMember({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: manager._id,
    workspaceRole: "project_manager",
    status: "active",
    invitedBy: actor.id,
    invitedByName: actor.name,
  });

  if (previousManagerId && String(previousManagerId) !== String(manager._id)) {
    await WorkspaceMember.updateOne(
      {
        workspace: workspace._id,
        adminUser: previousManagerId,
        memberType: "employee",
        status: "active",
        workspaceRole: "project_manager",
      },
      { $set: { workspaceRole: "contributor" } },
    );
  }

  await recordCaseActivity({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: "project_manager_changed",
    message: `Project manager changed to ${String(manager.name)} by ${actor.name}.`,
    actor,
    meta: {
      previousManagerId: previousManagerId ? String(previousManagerId) : null,
      newManagerId: String(manager._id),
    },
  });

  await notifyEmployee({
    adminUserId: manager._id,
    title: `Assigned as project manager: ${String(caseDoc.caseNumber)}`,
    message: `You were assigned as project manager for "${String(caseDoc.title)}".`,
    type: "case_assigned_manager",
    relatedCase: caseDoc._id,
  });

  return { outcome: "updated" };
}

/** Adds (or reactivates) an employee member of the case workspace. */
export async function addEmployeeMember(params: {
  caseDoc: Record<string, unknown>;
  workspace: Record<string, unknown>;
  adminUserId: string;
  workspaceRole?: string;
  clientVisible?: boolean;
  actor: OperationActor;
}): Promise<OperationResult> {
  const { caseDoc, workspace, adminUserId, actor } = params;

  if (!mongoose.Types.ObjectId.isValid(adminUserId)) {
    return { outcome: "validation_error", message: "That is not a valid team member." };
  }

  const workspaceRole = params.workspaceRole || "contributor";
  if (!WORKSPACE_ROLES.includes(workspaceRole as (typeof WORKSPACE_ROLES)[number])) {
    return { outcome: "validation_error", message: "That is not a valid workspace role." };
  }
  // The project_manager role is owned by the assignment action, which also
  // updates ClientCase.projectManager. Granting it here would leave the
  // case record and the workspace disagreeing about who runs the case.
  if (workspaceRole === "project_manager") {
    return {
      outcome: "validation_error",
      message: "Use the project manager assignment to change who runs this case.",
    };
  }

  const employee = await AdminUser.findOne({ _id: adminUserId, isActive: true })
    .select("name")
    .lean();
  if (!employee) {
    return { outcome: "validation_error", message: "Not a valid, active team member." };
  }

  const record = employee as Record<string, unknown>;

  const existing = await WorkspaceMember.findOne({
    workspace: workspace._id,
    adminUser: record._id,
  })
    .select("status")
    .lean();
  const wasRemoved = Boolean(existing) && (existing as { status?: string }).status === "removed";

  const member = await addOrReactivateMember({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: record._id,
    workspaceRole,
    status: "active",
    clientVisible: params.clientVisible ?? true,
    invitedBy: actor.id,
    invitedByName: actor.name,
  });

  await recordCaseActivity({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: wasRemoved ? "member_reactivated" : "employee_membership_created",
    message: `${String(record.name)} ${wasRemoved ? "re-added" : "added"} to the case workspace by ${actor.name}.`,
    actor,
    targetMember: member?._id,
  });

  await notifyEmployee({
    adminUserId: record._id,
    title: `Added to case ${String(caseDoc.caseNumber)}`,
    message: `You were added to the workspace for "${String(caseDoc.title)}".`,
    type: "case_member_added",
    relatedCase: caseDoc._id,
  });

  if (!wasRemoved) {
    await emitMemberAddedMessage({
      workspaceId: workspace._id,
      workspaceMemberId: member?._id,
      memberDisplayName: String(record.name),
    });
  }

  return { outcome: "added", memberId: String(member?._id) };
}

/**
 * Removes a member.
 *
 * Refuses to remove the primary client or the sitting project manager
 * without an explicit transfer/replacement first: no case-transfer
 * workflow exists yet that could safely replace a removed primary client,
 * and a case must never silently lose its project manager.
 */
export async function removeMemberFromCase(params: {
  caseDoc: Record<string, unknown>;
  workspace: Record<string, unknown>;
  memberId: string;
  actor: OperationActor;
}): Promise<OperationResult> {
  const { caseDoc, workspace, memberId, actor } = params;

  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return { outcome: "validation_error", message: "That is not a valid member." };
  }

  const member = await WorkspaceMember.findOne({ _id: memberId, workspace: workspace._id }).lean();
  if (!member || (member as { status?: string }).status === "removed") {
    return { outcome: "not_found" };
  }

  const record = member as Record<string, unknown>;

  if (record.memberType === "client" && String(record.clientUser) === String(caseDoc.primaryClient)) {
    return {
      outcome: "validation_error",
      message: "Cannot remove the primary client — transfer the case first.",
    };
  }
  if (
    record.memberType === "employee" &&
    String(record.adminUser) === String(caseDoc.projectManager ?? "")
  ) {
    return {
      outcome: "validation_error",
      message: "Cannot remove the current project manager — assign a replacement first.",
    };
  }

  await removeMember(record._id);

  await recordCaseActivity({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: "member_removed",
    message: `Member removed from the case workspace by ${actor.name}.`,
    actor,
    targetMember: record._id,
  });

  return { outcome: "removed" };
}
