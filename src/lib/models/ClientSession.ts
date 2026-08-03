import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * DB-backed session record for the client portal (see
 * docs/architecture/ADR-001-client-portal-foundation.md, decision 3). The
 * Next.js app has no express-session equivalent, so the portal's
 * "session-based auth" is built explicitly: the httpOnly cookie holds only
 * a random opaque token, and this collection holds its SHA-256 hash plus
 * idle/absolute expiry. Deleting a document immediately revokes that
 * session — used by logout and by password reset (which deletes every
 * session for the affected client).
 */

const ClientSessionSchema = new Schema(
  {
    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", required: true },
    tokenHash: { type: String, required: true },
    // Absolute timeout — never extended, forces re-login regardless of activity.
    expiresAt: { type: Date, required: true },
    // Idle timeout — pushed forward on each authenticated request.
    idleExpiresAt: { type: Date, required: true },
    createdIp: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

ClientSessionSchema.index({ tokenHash: 1 }, { unique: true });
ClientSessionSchema.index({ clientUser: 1 });
// TTL sweep shortly after the absolute expiry — the application still
// checks both expiresAt and idleExpiresAt itself rather than relying on the
// Mongo background sweep's timing for correctness.
ClientSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const ClientSession =
  mongoose.models.ClientSession ||
  mongoose.model("ClientSession", ClientSessionSchema);
