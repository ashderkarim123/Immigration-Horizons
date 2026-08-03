import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * An authenticated client-portal account — deliberately separate from
 * server/models/admin/User.js (AdminUser). Clients are never given an
 * AdminUser role; a lead only gains portal access through the invitation
 * flow in src/lib/auth/invitations.ts.
 */

export const CLIENT_USER_STATUS_VALUES = [
  "pending",
  "active",
  "locked",
  "disabled",
] as const;

export type ClientUserStatus = (typeof CLIENT_USER_STATUS_VALUES)[number];

const ClientUserSchema = new Schema(
  {
    email: { type: String, required: true, trim: true },
    // Lowercased + trimmed form used for lookups/uniqueness so
    // "Name@Example.com" and "name@example.com" are the same account.
    normalizedEmail: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: "" },
    // Not required: the only source at signup time is the consultation
    // form's single free-text "name" field, best-effort split on first
    // whitespace (see splitName() in src/lib/auth/invitations.ts) — not
    // reliable enough to enforce as a hard requirement.
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: CLIENT_USER_STATUS_VALUES,
      default: "pending",
    },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    acceptedTermsAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ClientUserSchema.index({ normalizedEmail: 1 }, { unique: true });
ClientUserSchema.index({ status: 1 });
ClientUserSchema.index({ lastLoginAt: 1 });

// Next.js dev hot-reload re-evaluates this module repeatedly; mongoose throws
// "OverwriteModelError" if the model is registered twice on the same connection.
export const ClientUser =
  mongoose.models.ClientUser || mongoose.model("ClientUser", ClientUserSchema);
