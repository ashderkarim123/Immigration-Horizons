const mongoose = require('mongoose');

/**
 * Mirrors src/lib/models/PortalInvitation.ts — same field names, same
 * enums, same indexes (ADR-007 §1). The portal owns activation; this app
 * only ever READS invitation status and REVOKES/RE-ISSUES invitations from
 * the admin's client-management screens. It never reads a raw token — only
 * tokenHash is stored, in either app.
 */
const PORTAL_INVITATION_PURPOSE_VALUES = [
  'consultation_activation',
  'case_invitation',
  'additional_client_invitation',
];

const PortalInvitationSchema = new mongoose.Schema(
  {
    normalizedEmail: { type: String, required: true, trim: true, lowercase: true },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', default: null },
    tokenHash: { type: String, required: true },
    purpose: {
      type: String,
      enum: PORTAL_INVITATION_PURPOSE_VALUES,
      default: 'consultation_activation',
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    createdByType: { type: String, enum: ['system', 'admin'], default: 'system' },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

PortalInvitationSchema.statics.PURPOSE_VALUES = PORTAL_INVITATION_PURPOSE_VALUES;

PortalInvitationSchema.index({ tokenHash: 1 }, { unique: true });
PortalInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
PortalInvitationSchema.index({ normalizedEmail: 1, purpose: 1, usedAt: 1 });

module.exports = mongoose.model('PortalInvitation', PortalInvitationSchema);
