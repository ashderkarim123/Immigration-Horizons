import "server-only";

import mongoose, { Schema } from "mongoose";

import { CHANNEL_MEMBER_STATUSES } from "../content/collaboration-constants";

/** Mirrors server/models/ChannelMember.js. */
const ChannelMemberSchema = new Schema(
  {
    channel: { type: Schema.Types.ObjectId, ref: "WorkspaceChannel", required: true },
    workspaceMember: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },

    status: { type: String, enum: CHANNEL_MEMBER_STATUSES, default: "active" },

    addedBy: { type: Schema.Types.ObjectId, default: null },
    addedByType: { type: String, enum: ["admin_user", "env_fallback", "system"], default: "system" },

    joinedAt: { type: Date, default: Date.now },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ChannelMemberSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.status === "removed" && !this.removedAt) {
    throw new Error('status "removed" requires removedAt.');
  }
});

ChannelMemberSchema.index({ channel: 1, workspaceMember: 1 }, { unique: true });
ChannelMemberSchema.index({ workspaceMember: 1, status: 1 });

export const ChannelMember =
  mongoose.models.ChannelMember || mongoose.model("ChannelMember", ChannelMemberSchema, "channel_members");
