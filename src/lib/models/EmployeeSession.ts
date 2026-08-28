import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * DB-backed session for employees in the SaaS app (ADR-009 §2).
 *
 * Deliberately a separate collection and a separate cookie from both:
 *   - `ClientSession` — a client and an employee are different actor types
 *     and must never be confusable by swapping a token; and
 *   - the Express admin CMS's `express-session` store — that uses a signed
 *     cookie and a different record shape, and sharing it would require
 *     widening the cookie to `.immigrationhorizons.com` and coupling the
 *     two apps' session formats.
 *
 * Same opaque-token + SHA-256-hash-at-rest design as ClientSession: the
 * cookie holds a random token, this collection holds only its hash, and
 * deleting a row revokes that session immediately.
 */
const EmployeeSessionSchema = new Schema(
  {
    adminUser: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    tokenHash: { type: String, required: true },
    // Role snapshot at sign-in, used only for display. Authorization always
    // re-reads the live AdminUser — a role changed or revoked mid-session
    // must take effect on the next request, not at the next login.
    roleSnapshot: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    createdIp: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

EmployeeSessionSchema.index({ tokenHash: 1 }, { unique: true });
EmployeeSessionSchema.index({ adminUser: 1 });
EmployeeSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const EmployeeSession =
  mongoose.models.EmployeeSession ||
  mongoose.model("EmployeeSession", EmployeeSessionSchema, "employee_sessions");
