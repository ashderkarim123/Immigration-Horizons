import "server-only";

import mongoose, { Schema } from "mongoose";

import {
  SENDER_TYPES,
  MESSAGE_TYPES,
  CLIENT_CREATABLE_MESSAGE_TYPES,
  MENTION_MEMBER_TYPES,
  DELETE_ACTOR_TYPES,
  MAX_MESSAGE_BODY_LENGTH,
} from "../content/collaboration-constants";

/**
 * Mirrors server/models/WorkspaceMessage.js — dual-writer (clients
 * send/edit/delete their own messages from this app; employees do the
 * same plus moderate from Express), each only ever setting the fields it
 * owns. See docs/architecture/ADR-005-team-collaboration.md §1/§14.
 * `optimisticConcurrency: true` must match the server copy exactly, since
 * both apps write this collection.
 */
const MentionSchema = new Schema(
  {
    memberType: { type: String, enum: MENTION_MEMBER_TYPES, required: true },
    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    adminUser: { type: Schema.Types.ObjectId, default: null },
    workspaceMember: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },
    displayNameSnapshot: { type: String, required: true, trim: true, maxlength: 150 },
  },
  { _id: false },
);

const AttachmentSchema = new Schema(
  {
    document: { type: Schema.Types.ObjectId, ref: "CaseDocument", required: true },
    documentVersion: { type: Schema.Types.ObjectId, ref: "DocumentVersion", required: true },
    displayNameSnapshot: { type: String, required: true, trim: true, maxlength: 255 },
  },
  { _id: false },
);

const WorkspaceMessageSchema = new Schema(
  {
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    channel: { type: Schema.Types.ObjectId, ref: "WorkspaceChannel", required: true },

    senderType: { type: String, enum: SENDER_TYPES, required: true },
    senderClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    senderAdmin: { type: Schema.Types.ObjectId, default: null },
    senderDisplayName: { type: String, required: true, trim: true, maxlength: 150 },

    body: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_BODY_LENGTH },
    bodyFormat: { type: String, enum: ["plain_text"], default: "plain_text" },
    messageType: { type: String, enum: MESSAGE_TYPES, default: "text" },

    parentMessage: { type: Schema.Types.ObjectId, ref: "WorkspaceMessage", default: null },
    threadRoot: { type: Schema.Types.ObjectId, ref: "WorkspaceMessage", default: null },
    replyCount: { type: Number, default: 0 },
    lastReplyAt: { type: Date, default: null },

    mentions: { type: [MentionSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },

    editedAt: { type: Date, default: null },

    deletedAt: { type: Date, default: null },
    deletedByType: { type: String, enum: DELETE_ACTOR_TYPES, default: null },
    deletedByClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    deletedByAdmin: { type: Schema.Types.ObjectId, default: null },
    deletionReason: { type: String, default: "", maxlength: 500 },

    clientVisible: { type: Boolean, default: true },
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

WorkspaceMessageSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.senderType === "client") {
    if (!this.senderClient) throw new Error('senderType "client" requires senderClient.');
    if (this.senderAdmin) throw new Error('senderType "client" must not set senderAdmin.');
    if (!(CLIENT_CREATABLE_MESSAGE_TYPES as readonly string[]).includes(this.messageType as string)) {
      throw new Error(`senderType "client" cannot create messageType "${this.messageType}".`);
    }
  } else if (this.senderType === "employee") {
    if (!this.senderAdmin) throw new Error('senderType "employee" requires senderAdmin.');
    if (this.senderClient) throw new Error('senderType "employee" must not set senderClient.');
  } else if (this.senderType === "system") {
    if (this.senderClient || this.senderAdmin) {
      throw new Error('senderType "system" must not set senderClient or senderAdmin.');
    }
  }

  if (this.parentMessage && !this.threadRoot) {
    throw new Error("parentMessage requires threadRoot.");
  }
  if (!this.parentMessage && this.threadRoot) {
    throw new Error("threadRoot requires parentMessage.");
  }

  if (this.deletedAt) {
    if (!this.deletedByType) throw new Error("deletedAt requires deletedByType.");
    if (this.deletedByType === "client" && !this.deletedByClient) {
      throw new Error('deletedByType "client" requires deletedByClient.');
    }
    if (this.deletedByType === "employee" && !this.deletedByAdmin) {
      throw new Error('deletedByType "employee" requires deletedByAdmin.');
    }
  }

  const attachments = this.attachments as unknown[];
  if ((!this.body || !(this.body as string).trim()) && attachments.length === 0) {
    throw new Error("A message requires a non-empty body or at least one attachment.");
  }
});

WorkspaceMessageSchema.index({ channel: 1, createdAt: -1, _id: -1 });
WorkspaceMessageSchema.index({ channel: 1, parentMessage: 1, createdAt: 1, _id: 1 });
WorkspaceMessageSchema.index({ threadRoot: 1, createdAt: 1, _id: 1 });
WorkspaceMessageSchema.index({ senderClient: 1, createdAt: -1 });
WorkspaceMessageSchema.index(
  { channel: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

export const WorkspaceMessage =
  mongoose.models.WorkspaceMessage || mongoose.model("WorkspaceMessage", WorkspaceMessageSchema, "workspace_messages");
