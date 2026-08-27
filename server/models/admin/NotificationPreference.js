const mongoose = require('mongoose');

const RECIPIENT_TYPES = ['employee', 'client'];
const DIGEST_FREQUENCIES = ['daily', 'weekly', 'off'];

/**
 * One document per recipient, created lazily on first read
 * (notificationService.getOrCreatePreferences) rather than backfilled for
 * every existing user — see ADR-006 §8 for why this is a minimal
 * three-field model rather than a full per-event-type matrix.
 */
const NotificationPreferenceSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: RECIPIENT_TYPES, required: true },
    recipientAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    recipientClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },

    mentionEmails: { type: Boolean, default: true },
    digestEmails: { type: Boolean, default: true },
    digestFrequency: { type: String, enum: DIGEST_FREQUENCIES, default: 'daily' },
  },
  { timestamps: true }
);

NotificationPreferenceSchema.pre('validate', function () {
  if (this.recipientType === 'employee' && !this.recipientAdmin) {
    throw new Error('recipientType "employee" requires recipientAdmin.');
  }
  if (this.recipientType === 'client' && !this.recipientClient) {
    throw new Error('recipientType "client" requires recipientClient.');
  }
});

NotificationPreferenceSchema.statics.RECIPIENT_TYPES = RECIPIENT_TYPES;
NotificationPreferenceSchema.statics.DIGEST_FREQUENCIES = DIGEST_FREQUENCIES;

NotificationPreferenceSchema.index({ recipientAdmin: 1 }, { unique: true, partialFilterExpression: { recipientAdmin: { $type: 'objectId' } } });
NotificationPreferenceSchema.index({ recipientClient: 1 }, { unique: true, partialFilterExpression: { recipientClient: { $type: 'objectId' } } });

module.exports = mongoose.model(
  'NotificationPreference',
  NotificationPreferenceSchema,
  'notification_preferences',
);
