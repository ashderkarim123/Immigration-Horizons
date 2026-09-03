const mongoose = require('mongoose');

/**
 * Append-only security/audit log — mirror of src/lib/models/SecurityEvent.ts
 * (ADR-012 §1). Both applications write this collection, so an operator
 * investigating an incident does not have to know which application an
 * attacker hit before they can find the record.
 *
 * Case history (CaseActivity) and document access (DocumentAccessLog)
 * already have their own append-only logs and are not duplicated here.
 * This log covers authentication, account changes, and refusals.
 */
const SECURITY_EVENT_TYPES = [
  'login_succeeded',
  'login_failed',
  'account_locked',
  'logout',
  'activation_completed',
  'password_reset_requested',
  'password_reset_completed',
  'password_changed',
  'session_revoked',
  'permission_denied',
  'csrf_rejected',
];

const SECURITY_EVENT_RESULTS = ['success', 'failure', 'denied'];

const SECURITY_EVENT_ACTOR_TYPES = ['client', 'admin_user', 'env_fallback', 'anonymous', 'system'];

const SECURITY_EVENT_SURFACES = ['portal', 'staff', 'admin_cms'];

const SecurityEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: SECURITY_EVENT_TYPES, required: true },
    result: { type: String, enum: SECURITY_EVENT_RESULTS, required: true },
    surface: { type: String, enum: SECURITY_EVENT_SURFACES, required: true },

    actorType: { type: String, enum: SECURITY_EVENT_ACTOR_TYPES, required: true },
    actorClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    actorAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    actorName: { type: String, default: '' },

    // The account the request was made against. An identifier, never a
    // credential — see utils/securityEvents.js for what may never be
    // stored, and docs/security/DATA_RETENTION.md for how long this lives.
    subjectEmail: { type: String, default: '', lowercase: true, trim: true },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SecurityEventSchema.index({ createdAt: -1 });
SecurityEventSchema.index({ type: 1, createdAt: -1 });
SecurityEventSchema.index({ subjectEmail: 1, createdAt: -1 });
SecurityEventSchema.index({ actorClient: 1, createdAt: -1 });
SecurityEventSchema.index({ actorAdmin: 1, createdAt: -1 });
SecurityEventSchema.index({ ip: 1, createdAt: -1 });

// Append-only, enforced rather than merely documented. This guards against
// application code drifting into "just fix up that one row"; it is not a
// database permission, and does not stop a raw driver call.
const APPEND_ONLY_MESSAGE =
  'security_events is append-only: entries cannot be modified or deleted through the application.';

['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'].forEach((op) => {
  SecurityEventSchema.pre(op, function () {
    throw new Error(APPEND_ONLY_MESSAGE);
  });
});
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => {
  SecurityEventSchema.pre(op, function () {
    throw new Error(APPEND_ONLY_MESSAGE);
  });
});
SecurityEventSchema.pre('save', function () {
  if (!this.isNew) throw new Error(APPEND_ONLY_MESSAGE);
});

SecurityEventSchema.statics.TYPES = SECURITY_EVENT_TYPES;
SecurityEventSchema.statics.RESULTS = SECURITY_EVENT_RESULTS;
SecurityEventSchema.statics.ACTOR_TYPES = SECURITY_EVENT_ACTOR_TYPES;
SecurityEventSchema.statics.SURFACES = SECURITY_EVENT_SURFACES;

module.exports = mongoose.model('SecurityEvent', SecurityEventSchema, 'security_events');
module.exports.SECURITY_EVENT_TYPES = SECURITY_EVENT_TYPES;
module.exports.SECURITY_EVENT_RESULTS = SECURITY_EVENT_RESULTS;
module.exports.SECURITY_EVENT_ACTOR_TYPES = SECURITY_EVENT_ACTOR_TYPES;
module.exports.SECURITY_EVENT_SURFACES = SECURITY_EVENT_SURFACES;
