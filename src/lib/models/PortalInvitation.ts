import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * A single-use, expiring, revocable token that lets a consultation
 * submitter (or an admin, later) grant portal access. Only tokenHash is
 * ever persisted — the raw token exists only in the activation URL sent by
 * email, never in the database or logs.
 */

export const PORTAL_INVITATION_PURPOSE_VALUES = [
  // Cycle 1: issued automatically when a consultation is submitted.
  "consultation_activation",
  // Reserved for later cycles (case invitations, additional client
  // invitations) so the purpose enum doesn't need a migration to extend.
  "case_invitation",
  "additional_client_invitation",
] as const;

export type PortalInvitationPurpose =
  (typeof PORTAL_INVITATION_PURPOSE_VALUES)[number];

const PortalInvitationSchema = new Schema(
  {
    normalizedEmail: { type: String, required: true, trim: true, lowercase: true },
    // Name snapshot from the triggering consultation, so activation can
    // create the ClientUser without asking the submitter to type their name
    // a second time. Best-effort — the consultation form collects one free
    // text "name" field, not separate first/last name.
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    consultation: { type: Schema.Types.ObjectId, ref: "Consultation", default: null },
    tokenHash: { type: String, required: true },
    purpose: {
      type: String,
      enum: PORTAL_INVITATION_PURPOSE_VALUES,
      default: "consultation_activation",
    },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    createdByType: { type: String, enum: ["system", "admin"], default: "system" },
    createdByAdmin: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

PortalInvitationSchema.index({ tokenHash: 1 }, { unique: true });
// TTL: Mongo removes documents some time after expiresAt has passed. Kept
// generous (7 days past expiry) so an already-expired-but-recent invitation
// is still visible for support/audit purposes before it's swept.
PortalInvitationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 },
);
PortalInvitationSchema.index({ normalizedEmail: 1, purpose: 1, usedAt: 1 });

export const PortalInvitation =
  mongoose.models.PortalInvitation ||
  mongoose.model("PortalInvitation", PortalInvitationSchema);
