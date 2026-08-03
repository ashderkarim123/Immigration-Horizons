import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Single-use, expiring, revocable password-reset token. Kept as a
 * dedicated model (rather than reusing PortalInvitation) because reset
 * tokens are always issued against an existing active account, never
 * create one, and have a much shorter useful lifetime.
 */

const PasswordResetTokenSchema = new Schema(
  {
    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    requestedIp: { type: String, default: "" },
  },
  { timestamps: true },
);

PasswordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
PasswordResetTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 },
);
PasswordResetTokenSchema.index({ clientUser: 1, usedAt: 1 });

export const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
