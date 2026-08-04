import "server-only";

import mongoose, { Schema } from "mongoose";

/** Mirrors server/models/ChannelReadState.js. */
const ChannelReadStateSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    channel: { type: Schema.Types.ObjectId, ref: "WorkspaceChannel", required: true },
    workspaceMember: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },

    lastReadMessage: { type: Schema.Types.ObjectId, ref: "WorkspaceMessage", default: null },
    lastReadAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ChannelReadStateSchema.index({ channel: 1, workspaceMember: 1 }, { unique: true });

export const ChannelReadState =
  mongoose.models.ChannelReadState || mongoose.model("ChannelReadState", ChannelReadStateSchema, "channel_read_states");
