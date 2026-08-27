const mongoose = require('mongoose');

/**
 * Mirrors src/lib/models/ClientSession.ts — same field names, same indexes
 * (ADR-007 §1). The portal owns session creation and validation; this app
 * only READS sessions (for the admin's client security summary) and DELETES
 * them (revoking access when an account is disabled). It never mints one.
 */
const ClientSessionSchema = new mongoose.Schema(
  {
    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    createdIp: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

ClientSessionSchema.index({ tokenHash: 1 }, { unique: true });
ClientSessionSchema.index({ clientUser: 1 });
ClientSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model('ClientSession', ClientSessionSchema);
