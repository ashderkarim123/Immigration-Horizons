const mongoose = require('mongoose');
const { MESSAGE_REVISION_ACTIONS, MENTION_MEMBER_TYPES } = require('../utils/collaborationConstants');

/**
 * Append-only edit/deletion/moderation history for a WorkspaceMessage. See
 * docs/architecture/ADR-005-team-collaboration.md §15. No route in either
 * app updates or deletes a revision row after creation. Not readable by
 * normal clients — see messages.view_revisions capability
 * (server/services/collaborationPolicy.js).
 */
const RevisionMentionSchema = new mongoose.Schema(
  {
    memberType: { type: String, enum: MENTION_MEMBER_TYPES },
    workspaceMember: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMember' },
    displayNameSnapshot: { type: String, default: '' },
  },
  { _id: false },
);

const RevisionAttachmentSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument' },
    documentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion' },
    displayNameSnapshot: { type: String, default: '' },
  },
  { _id: false },
);

const MessageRevisionSchema = new mongoose.Schema(
  {
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMessage', required: true },
    revisionNumber: { type: Number, required: true, min: 1 },
    action: { type: String, enum: MESSAGE_REVISION_ACTIONS, required: true },

    previousBody: { type: String, default: '' },
    newBody: { type: String, default: '' },
    previousAttachments: { type: [RevisionAttachmentSchema], default: [] },
    newAttachments: { type: [RevisionAttachmentSchema], default: [] },
    previousMentions: { type: [RevisionMentionSchema], default: [] },
    newMentions: { type: [RevisionMentionSchema], default: [] },

    actorType: { type: String, enum: ['client', 'employee', 'system'], required: true },
    actorClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    actorAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    // Internal moderation reason — never exposed to clients (module doc §17).
    reason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MessageRevisionSchema.index({ message: 1, revisionNumber: 1 }, { unique: true });
MessageRevisionSchema.index({ message: 1, createdAt: -1 });

module.exports = mongoose.model('MessageRevision', MessageRevisionSchema, 'message_revisions');
