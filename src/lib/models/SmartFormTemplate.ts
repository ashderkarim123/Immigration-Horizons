import "server-only";

import mongoose, { Schema } from "mongoose";

import { TEMPLATE_STATUSES, TEMPLATE_AUDIENCES } from "../content/smart-form-constants";

/**
 * Mirrors server/models/SmartFormTemplate.js (ADR-021 §4). The portal only
 * READS templates — they are published by the Express seeder and are
 * immutable once published — so there is no write path here.
 */
const SmartFormTemplateSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    caseTypes: [{ type: String }],
    audience: { type: String, enum: TEMPLATE_AUDIENCES, default: "client_and_staff" },
    schemaVersion: { type: Number, default: 1 },
    sections: { type: [Schema.Types.Mixed], default: [] },
    status: { type: String, enum: TEMPLATE_STATUSES, default: "draft" },
    contentHash: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true },
);

SmartFormTemplateSchema.index({ key: 1, version: 1 }, { unique: true });
SmartFormTemplateSchema.index({ status: 1, caseTypes: 1 });

export const SmartFormTemplate =
  mongoose.models.SmartFormTemplate || mongoose.model("SmartFormTemplate", SmartFormTemplateSchema, "smart_form_templates");
