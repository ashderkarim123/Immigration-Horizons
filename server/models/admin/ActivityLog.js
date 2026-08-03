const mongoose = require('mongoose');

const ACTIVITY_TYPES = [
  'received',
  'contacted',
  'assigned',
  'note_added',
  'task_created',
  'task_completed',
  'status_changed',
  'file_uploaded',
  'message_sent',
  'package_delivered',
  // Cycle 2: the one lead-side event a case conversion generates, linking
  // back to the new case via `meta` — everything after this point is
  // recorded on the case itself (see models/CaseActivity.js), not here.
  'case_converted',
];

/**
 * Append-only event log per lead — this is what powers the "communication
 * history" / case-history timeline on the lead detail page.
 */
const ActivityLogSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', required: true, index: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    message: { type: String, required: true },
    actor: { type: String, default: 'System' },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

ActivityLogSchema.statics.TYPES = ACTIVITY_TYPES;

/** Convenience creator so call sites don't repeat the same shape everywhere. */
ActivityLogSchema.statics.record = function record(leadId, type, message, actor, meta) {
  return this.create({ lead: leadId, type, message, actor: actor || 'System', meta: meta || null });
};

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
