import "server-only";

import mongoose, { Schema } from "mongoose";

import { MEMBER_TYPES, WORKSPACE_ROLES, MEMBERSHIP_STATUSES } from "../content/case-constants";

/**
 * Mirror of server/models/WorkspaceMember.js — see
 * docs/architecture/ADR-002-case-workspace-domain.md §1. This app is
 * read-only against this collection with exactly ONE documented exception:
 * src/app/api/portal/activate/route.ts flips a client's own 'invited'
 * membership(s) to 'active' immediately after their ClientUser account
 * activates (module doc §"Consultation linked to pending ClientUser":
 * "Activate membership when account activation succeeds"). That single
 * narrow write is the only place this app ever mutates this collection.
 */
const WorkspaceMemberSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    memberType: { type: String, enum: MEMBER_TYPES, required: true },
    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    adminUser: { type: Schema.Types.ObjectId, default: null },
    workspaceRole: { type: String, enum: WORKSPACE_ROLES, required: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: "invited" },
    joinedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, default: null },
    invitedByName: { type: String, default: "" },
    invitedByType: { type: String, enum: ["admin_user", "env_fallback", "system"], default: "system" },
    clientVisible: { type: Boolean, default: true },
    displayRole: { type: String, default: "" },
  },
  { timestamps: true },
);

WorkspaceMemberSchema.index(
  { workspace: 1, clientUser: 1 },
  { unique: true, partialFilterExpression: { clientUser: { $type: "objectId" } } },
);
WorkspaceMemberSchema.index(
  { workspace: 1, adminUser: 1 },
  { unique: true, partialFilterExpression: { adminUser: { $type: "objectId" } } },
);
WorkspaceMemberSchema.index({ clientUser: 1, status: 1 });

export const WorkspaceMember =
  mongoose.models.WorkspaceMember ||
  mongoose.model("WorkspaceMember", WorkspaceMemberSchema, "workspace_members");
