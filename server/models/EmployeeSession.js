const mongoose = require('mongoose');

/**
 * DB-backed session for employees in the SaaS app (ADR-009 §2 and ADR-016).
 * This mirrors the src/lib/models/EmployeeSession.ts model from the Next.js side,
 * allowing the Express canonical API to create and validate sessions using the
 * exact same MongoDB collection `employee_sessions`.
 */
const EmployeeSessionSchema = new mongoose.Schema(
  {
    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    tokenHash: { type: String, required: true },
    // Role snapshot at sign-in, used only for display. Authorization always
    // re-reads the live AdminUser.
    roleSnapshot: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    createdIp: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

EmployeeSessionSchema.index({ tokenHash: 1 }, { unique: true });
EmployeeSessionSchema.index({ adminUser: 1 });
EmployeeSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model('EmployeeSession', EmployeeSessionSchema, 'employee_sessions');
