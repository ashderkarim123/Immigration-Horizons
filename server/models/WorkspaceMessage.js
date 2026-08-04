const mongoose = require('mongoose');
const {
  SENDER_TYPES,
  MESSAGE_TYPES,
  CLIENT_CREATABLE_MESSAGE_TYPES,
  MENTION_MEMBER_TYPES,
  DELETE_ACTOR_TYPES,
  MAX_MESSAGE_BODY_LENGTH,
} = require('../utils/collaborationConstants');

/**
 * A durable channel message — text, reply, or system-generated update. See
 * docs/architecture/ADR-005-team-collaboration.md. Dual-writer, same
 * shape as CaseDocument (ADR-004 §1): clients send/edit/delete their own
 * messages from the portal, employees do the same plus moderate from
 * admin, never the same fields.
 *
 * `parentMessage`/`threadRoot` are always equal for a reply in this
 * cycle's one-level-only threading (a reply-to-a-reply is normalized to
 * the thread root before persisting, at the service layer) — both fields
 * are kept, per the module's own field list, so a future cycle could
 * support real nesting without a schema change (ADR-005 §9).
 *
 * `optimisticConcurrency: true` protects concurrent edits (ADR-005 §14) —
 * the real mechanism established in ADR-003 §2, not the non-functional
 * default `__v`.
 */
const MentionSchema = new mongoose.Schema(
  {
    memberType: { type: String, enum: MENTION_MEMBER_TYPES, required: true },
    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    workspaceMember: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMember', required: true },
    displayNameSnapshot: { type: String, required: true, trim: true, maxlength: 150 },
  },
  { _id: false },
);

const AttachmentSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument', required: true },
    documentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion', required: true },
    displayNameSnapshot: { type: String, required: true, trim: true, maxlength: 255 },
  },
  { _id: false },
);

const WorkspaceMessageSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceChannel', required: true },

    senderType: { type: String, enum: SENDER_TYPES, required: true },
    senderClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    senderAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    senderDisplayName: { type: String, required: true, trim: true, maxlength: 150 },

    body: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_BODY_LENGTH },
    // Reserved for a future rich-formatting cycle — only 'plain_text' is
    // ever written this cycle (ADR-005 §7/§8: no formatting layer exists
    // yet, so there is nothing else this field could correctly say).
    bodyFormat: { type: String, enum: ['plain_text'], default: 'plain_text' },
    messageType: { type: String, enum: MESSAGE_TYPES, default: 'text' },

    parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMessage', default: null },
    threadRoot: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMessage', default: null },
    replyCount: { type: Number, default: 0 },
    lastReplyAt: { type: Date, default: null },

    mentions: { type: [MentionSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },

    editedAt: { type: Date, default: null },

    deletedAt: { type: Date, default: null },
    deletedByType: { type: String, enum: DELETE_ACTOR_TYPES, default: null },
    deletedByClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    deletedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    deletionReason: { type: String, default: '', maxlength: 500 },

    // Explicit for every message (ADR-005 §13/§18) — text/reply messages
    // default true (channel-level filtering is the real gate for those);
    // system messages must set this deliberately, independent of the
    // target channel's own visibility, as a defense-in-depth check.
    clientVisible: { type: Boolean, default: true },

    // Deduplicates a retried send/reply, or a system event re-fired for
    // the same underlying occurrence (ADR-005 §19) — unique per channel
    // wherever set (see index below).
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

WorkspaceMessageSchema.pre('validate', function () {
  if (this.senderType === 'client') {
    if (!this.senderClient) throw new Error('senderType "client" requires senderClient.');
    if (this.senderAdmin) throw new Error('senderType "client" must not set senderAdmin.');
    if (!CLIENT_CREATABLE_MESSAGE_TYPES.includes(this.messageType)) {
      throw new Error(`senderType "client" cannot create messageType "${this.messageType}".`);
    }
  } else if (this.senderType === 'employee') {
    if (!this.senderAdmin) throw new Error('senderType "employee" requires senderAdmin.');
    if (this.senderClient) throw new Error('senderType "employee" must not set senderClient.');
  } else if (this.senderType === 'system') {
    if (this.senderClient || this.senderAdmin) {
      throw new Error('senderType "system" must not set senderClient or senderAdmin.');
    }
  }

  if (this.parentMessage && !this.threadRoot) {
    throw new Error('parentMessage requires threadRoot.');
  }
  if (!this.parentMessage && this.threadRoot) {
    throw new Error('threadRoot requires parentMessage.');
  }

  if (this.deletedAt) {
    if (!this.deletedByType) throw new Error('deletedAt requires deletedByType.');
    if (this.deletedByType === 'client' && !this.deletedByClient) {
      throw new Error('deletedByType "client" requires deletedByClient.');
    }
    if (this.deletedByType === 'employee' && !this.deletedByAdmin) {
      throw new Error('deletedByType "employee" requires deletedByAdmin.');
    }
  }

  if ((!this.body || !this.body.trim()) && this.attachments.length === 0) {
    throw new Error('A message requires a non-empty body or at least one attachment.');
  }
});

WorkspaceMessageSchema.index({ channel: 1, createdAt: -1, _id: -1 });
WorkspaceMessageSchema.index({ channel: 1, parentMessage: 1, createdAt: 1, _id: 1 });
WorkspaceMessageSchema.index({ threadRoot: 1, createdAt: 1, _id: 1 });
WorkspaceMessageSchema.index({ workspace: 1, createdAt: -1 });
WorkspaceMessageSchema.index({ senderClient: 1, createdAt: -1 });
WorkspaceMessageSchema.index({ senderAdmin: 1, createdAt: -1 });
WorkspaceMessageSchema.index({ deletedAt: 1 });
// Idempotent create/reply — unique per channel wherever a key is actually
// set (client/employee sends always set one; most system messages do too
// for event-identity dedup — ADR-005 §18/§19).
WorkspaceMessageSchema.index(
  { channel: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('WorkspaceMessage', WorkspaceMessageSchema, 'workspace_messages');
