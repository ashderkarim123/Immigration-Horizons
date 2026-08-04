const mongoose = require('mongoose');
const { UPDATE_TYPES, UPDATE_VISIBILITY } = require('../utils/interactionConstants');

/**
 * A narrow, non-chat follow-up entry on a ConsultationInteraction — client
 * follow-ups, employee clarification requests/notes, resolution
 * confirmations. Deliberately has no threading, mentions, reactions, or
 * read receipts (ADR-003 §9: not the future chat module).
 */
const InteractionUpdateSchema = new mongoose.Schema(
  {
    interaction: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultationInteraction', required: true },

    authorType: { type: String, enum: ['client', 'admin', 'system'], required: true },
    authorClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    authorAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    authorName: { type: String, default: '' },

    updateType: { type: String, enum: UPDATE_TYPES, required: true },
    // Plain text only — never rendered as raw HTML on either app (module doc §13).
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    visibility: { type: String, enum: UPDATE_VISIBILITY, required: true },

    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/**
 * A client can only ever author a client_visible update — enforced here so
 * it holds regardless of which app's route created the document (both do).
 */
InteractionUpdateSchema.pre('validate', function () {
  if (this.authorType === 'client') {
    if (!this.authorClient) throw new Error('authorType "client" requires authorClient.');
    if (this.authorAdmin) throw new Error('authorType "client" must not set authorAdmin.');
    if (this.visibility !== 'client_visible') {
      throw new Error('a client-authored update must be client_visible.');
    }
  } else if (this.authorType === 'admin') {
    if (!this.authorAdmin) throw new Error('authorType "admin" requires authorAdmin.');
    if (this.authorClient) throw new Error('authorType "admin" must not set authorClient.');
  }
});

InteractionUpdateSchema.index({ interaction: 1, createdAt: 1 });
InteractionUpdateSchema.index({ interaction: 1, visibility: 1, createdAt: 1 });

module.exports = mongoose.model('InteractionUpdate', InteractionUpdateSchema, 'interaction_updates');
