import "server-only";

import mongoose, { Schema } from "mongoose";

import { MESSAGE_REVISION_ACTIONS, MENTION_MEMBER_TYPES } from "../content/collaboration-constants";

/** Mirrors server/models/MessageRevision.js — append-only. */
const RevisionMentionSchema = new Schema(
  {
    memberType: { type: String, enum: MENTION_MEMBER_TYPES },
    workspaceMember: { type: Schema.Types.ObjectId, ref: "WorkspaceMember" },
    displayNameSnapshot: { type: String, default: "" },
  },
  { _id: false },
);

const RevisionAttachmentSchema = new Schema(
  {
    document: { type: Schema.Types.ObjectId, ref: "CaseDocument" },
    documentVersion: { type: Schema.Types.ObjectId, ref: "DocumentVersion" },
    displayNameSnapshot: { type: String, default: "" },
  },
  { _id: false },
);

const MessageRevisionSchema = new Schema(
  {
    message: { type: Schema.Types.ObjectId, ref: "WorkspaceMessage", required: true },
    revisionNumber: { type: Number, required: true, min: 1 },
    action: { type: String, enum: MESSAGE_REVISION_ACTIONS, required: true },

    previousBody: { type: String, default: "" },
    newBody: { type: String, default: "" },
    previousAttachments: { type: [RevisionAttachmentSchema], default: [] },
    newAttachments: { type: [RevisionAttachmentSchema], default: [] },
    previousMentions: { type: [RevisionMentionSchema], default: [] },
    newMentions: { type: [RevisionMentionSchema], default: [] },

    actorType: { type: String, enum: ["client", "employee", "system"], required: true },
    actorClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    actorAdmin: { type: Schema.Types.ObjectId, default: null },

    reason: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MessageRevisionSchema.index({ message: 1, revisionNumber: 1 }, { unique: true });
MessageRevisionSchema.index({ message: 1, createdAt: -1 });

export const MessageRevision =
  mongoose.models.MessageRevision || mongoose.model("MessageRevision", MessageRevisionSchema, "message_revisions");
