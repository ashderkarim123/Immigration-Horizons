import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Mirrors the legacy site's models/Consultation.js and this repo's own
 * server/models/Consultation.js — same field names, same enum, same collection ('consultations',
 * the default pluralisation of 'Consultation') — so a lead submitted through
 * this Next.js app shows up in the admin CMS's Leads dashboard untouched.
 *
 * Keep this in sync if either of those two models change, with one
 * intentional exception: `clientUser` (added for the client portal, see
 * ADR-001) exists only in this app's schema. It's optional/nullable, so the
 * legacy site and server/ — which don't know about the field — keep working
 * against the same collection unaffected.
 */

export const CONSULTATION_SERVICE_VALUES = [
  "EB-2 NIW",
  "EB-1A",
  "EB-1B",
  "EB-1C",
  "O-1 Visa",
  "RFE & NOID Responses",
  "Recommendation Letters",
  "Expert Opinion Letters",
  "Business & Personal Plans",
  "Evidence Review & Packaging",
  "Immigration Consultation",
  "Not Sure / Need Guidance",
] as const;

const ConsultationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    service: {
      type: String,
      enum: CONSULTATION_SERVICE_VALUES,
      default: "Not Sure / Need Guidance",
    },
    message: { type: String, required: true },
    country: { type: String, default: "", trim: true },
    occupation: { type: String, default: "", trim: true },
    attachmentUrl: { type: String, default: "" },
    source: { type: String, enum: ["consultation", "contact"], default: "consultation" },
    utmSource: { type: String, default: "" },
    utmMedium: { type: String, default: "" },
    utmCampaign: { type: String, default: "" },
    utmTerm: { type: String, default: "" },
    utmContent: { type: String, default: "" },
    gclid: { type: String, default: "" },
    fbclid: { type: String, default: "" },
    landingPage: { type: String, default: "" },
    referrer: { type: String, default: "" },
    emailSent: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["new", "contacted", "consultation_scheduled", "in_progress", "closed"],
      default: "new",
    },
    // Optional — set once the submitter's email is linked to a portal
    // account (existing account matched, or a new one activated). Absent
    // for the many leads that never create a portal account, so this must
    // stay optional/nullable, not required.
    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
  },
  { timestamps: true },
);

ConsultationSchema.index({ clientUser: 1, createdAt: -1 });

// Next.js dev hot-reload re-evaluates this module repeatedly; mongoose throws
// "OverwriteModelError" if the model is registered twice on the same connection.
export const Consultation =
  mongoose.models.Consultation ||
  mongoose.model("Consultation", ConsultationSchema);
