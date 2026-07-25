import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Mirrors models/Consultation.js (root) and web/server/models/Consultation.js
 * exactly — same field names, same enum, same collection ('consultations',
 * the default pluralisation of 'Consultation') — so a lead submitted through
 * this Next.js app shows up in the admin CMS's Leads dashboard untouched.
 *
 * Keep this in sync if either of those two models change.
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
  },
  { timestamps: true },
);

// Next.js dev hot-reload re-evaluates this module repeatedly; mongoose throws
// "OverwriteModelError" if the model is registered twice on the same connection.
export const Consultation =
  mongoose.models.Consultation ||
  mongoose.model("Consultation", ConsultationSchema);
