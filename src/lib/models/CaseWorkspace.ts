import "server-only";

import mongoose, { Schema } from "mongoose";

import { WORKSPACE_STATUSES, WORKSPACE_TYPES } from "../content/case-constants";

/**
 * Read-only mirror of server/models/CaseWorkspace.js — see
 * docs/architecture/ADR-002-case-workspace-domain.md §1.
 */
const CaseWorkspaceSchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: WORKSPACE_STATUSES, default: "active" },
    workspaceType: { type: String, enum: WORKSPACE_TYPES, default: "primary" },
    settings: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true },
);

CaseWorkspaceSchema.index(
  { case: 1, workspaceType: 1 },
  { unique: true, partialFilterExpression: { workspaceType: "primary" } },
);

export const CaseWorkspace =
  mongoose.models.CaseWorkspace ||
  mongoose.model("CaseWorkspace", CaseWorkspaceSchema, "case_workspaces");
