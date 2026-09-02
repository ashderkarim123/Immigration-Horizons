import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Mirror of server/models/CaseActivity.js — the append-only, case-scoped
 * audit log (ADR-002, ADR-010 §3).
 *
 * Unlike the other Cycle 2 mirrors, this app is a **writer** here: the
 * staff console's assignment, stage, and membership actions record their
 * own activity rather than routing through Express. Both apps therefore
 * append to one timeline, which is the point — a case's history must not
 * depend on which application an operator happened to use.
 *
 * The type list is asserted against
 * docs/architecture/case-schema-contract.json from both sides, so a type
 * added on one side and not the other fails tests on both.
 */
export const CASE_ACTIVITY_TYPES = [
  "case_created",
  "workspace_created",
  "client_membership_created",
  "employee_membership_created",
  "member_reactivated",
  "member_removed",
  "project_manager_changed",
  "stage_changed",
  "case_archived",
  "category_provisioned",
  "category_created",
  "category_renamed",
  "category_reordered",
  "category_disabled",
  "category_reactivated",
  "document_requested",
  "document_request_updated",
  "document_request_cancelled",
  "document_uploaded",
  "document_reviewed",
  "document_replacement_uploaded",
  "document_category_changed",
  "document_version_created",
  "document_archived",
  "channel_provisioned",
  "channel_created",
  "channel_renamed",
  "channel_visibility_changed",
  "channel_archived",
  "channel_reordered",
  "channel_member_added",
  "channel_member_removed",
  "client_update_published",
] as const;

export type CaseActivityType = (typeof CASE_ACTIVITY_TYPES)[number];

const CaseActivitySchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", default: null },
    type: { type: String, enum: CASE_ACTIVITY_TYPES, required: true },
    message: { type: String, required: true },

    // Actor snapshot, not just a reference — it must stay meaningful for
    // the admin CMS's env-credential fallback login, which has no
    // persistent AdminUser id. The SaaS app always has a real one.
    actorType: { type: String, enum: ["admin_user", "env_fallback", "system"], default: "system" },
    actorId: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    actorName: { type: String, default: "System" },

    targetMember: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", default: null },

    // Structured previous/new values — never secrets or invitation tokens.
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

CaseActivitySchema.index({ case: 1, createdAt: -1 });
CaseActivitySchema.index({ workspace: 1, createdAt: -1 });

export const CaseActivity =
  mongoose.models.CaseActivity ||
  mongoose.model("CaseActivity", CaseActivitySchema, "case_activities");

/** Append one timeline entry. Mirrors the server model's `record` static. */
export async function recordCaseActivity(params: {
  caseId: unknown;
  workspaceId?: unknown;
  type: CaseActivityType;
  message: string;
  actor: { id: unknown; name: string };
  targetMember?: unknown;
  meta?: Record<string, unknown> | null;
}) {
  return CaseActivity.create({
    case: params.caseId,
    workspace: params.workspaceId ?? null,
    type: params.type,
    message: params.message,
    // The SaaS app has no env-credential fallback — every employee session
    // is backed by a real AdminUser (ADR-009 §3), so this is always
    // 'admin_user' rather than a variable the caller could get wrong.
    actorType: "admin_user",
    actorId: params.actor.id,
    actorName: params.actor.name,
    targetMember: params.targetMember ?? null,
    meta: params.meta ?? null,
  });
}
