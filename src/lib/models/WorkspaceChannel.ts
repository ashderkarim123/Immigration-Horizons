import "server-only";

import mongoose, { Schema } from "mongoose";

import { CHANNEL_TYPES, CHANNEL_VISIBILITY } from "../content/collaboration-constants";

/**
 * Mirrors server/models/WorkspaceChannel.js — see
 * docs/architecture/ADR-005-team-collaboration.md. This app is read-only
 * against WorkspaceChannel (client message center lists channels; only
 * employees create/reorder/archive them).
 */
const WorkspaceChannelSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },

    templateKey: { type: String, default: null },

    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    description: { type: String, default: "", trim: true, maxlength: 500 },

    channelType: { type: String, enum: CHANNEL_TYPES, required: true },
    visibility: { type: String, enum: CHANNEL_VISIBILITY, required: true },
    order: { type: Number, required: true },

    createdByType: { type: String, enum: ["admin_user", "env_fallback", "system"], default: "system" },
    createdByAdmin: { type: Schema.Types.ObjectId, default: null },

    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

WorkspaceChannelSchema.index({ workspace: 1, slug: 1 }, { unique: true, partialFilterExpression: { archivedAt: null } });
WorkspaceChannelSchema.index({ workspace: 1, order: 1 }, { unique: true, partialFilterExpression: { archivedAt: null } });
WorkspaceChannelSchema.index({ workspace: 1, archivedAt: 1, order: 1 });

export const WorkspaceChannel =
  mongoose.models.WorkspaceChannel || mongoose.model("WorkspaceChannel", WorkspaceChannelSchema, "workspace_channels");
