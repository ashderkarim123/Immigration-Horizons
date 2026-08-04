const mongoose = require('mongoose');
const { HISTORY_EVENT_TYPES } = require('../utils/interactionConstants');

/**
 * Append-only lifecycle log for a ConsultationInteraction — no update or
 * delete route exists for this model anywhere in either app. Written only
 * by the service layer (server/services/interactionService.js and its
 * Next.js counterpart), never directly by a route handler, so every real
 * mutation produces exactly one entry (ADR-003 §8).
 */
const InteractionHistorySchema = new mongoose.Schema(
  {
    interaction: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultationInteraction', required: true },
    eventType: { type: String, enum: HISTORY_EVENT_TYPES, required: true },

    previousStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' },
    previousScheduledFor: { type: Date, default: null },
    newScheduledFor: { type: Date, default: null },
    previousTimezone: { type: String, default: '' },
    newTimezone: { type: String, default: '' },
    previousAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    newAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    actorType: { type: String, enum: ['client', 'admin_user', 'env_fallback', 'system'], default: 'system' },
    actorClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    actorAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    actorName: { type: String, default: 'System' },

    reason: { type: String, default: '', maxlength: 1000 },
    // Client-safe one-line summary shown on the simplified client timeline
    // — internalMetadata below is never sent through any client path.
    clientVisibleSummary: { type: String, default: '', maxlength: 300 },
    internalMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

InteractionHistorySchema.statics.TYPES = HISTORY_EVENT_TYPES;

InteractionHistorySchema.index({ interaction: 1, createdAt: 1 });

module.exports = mongoose.model('InteractionHistory', InteractionHistorySchema, 'interaction_history');
