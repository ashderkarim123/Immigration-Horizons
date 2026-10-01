import "server-only";

import mongoose, { Schema } from "mongoose";

import { FORM_STATUSES, SAVE_ACTOR_TYPES } from "../content/smart-form-constants";

/**
 * Mirrors server/models/CaseSmartForm.js (ADR-021 §9). Dual-writer: this app
 * saves and submits CLIENT answers; Express provisions forms and runs staff
 * edits and review. Every write goes through an atomic `revision` check
 * (see ../forms/form-service.ts) — never document.save().
 */
const ProgressSchema = new Schema(
  {
    completedRequired: { type: Number, default: 0 },
    totalRequired: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
  },
  { _id: false },
);

const CaseSmartFormSchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    template: { type: Schema.Types.ObjectId, ref: "SmartFormTemplate", required: true },
    templateKey: { type: String, required: true },
    templateVersion: { type: Number, required: true },
    templateTitleSnapshot: { type: String, required: true },

    answers: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: FORM_STATUSES, default: "draft" },
    revision: { type: Number, default: 1, min: 1 },
    progress: { type: ProgressSchema, default: () => ({}) },

    lastSavedAt: { type: Date, default: null },
    lastSavedByType: { type: String, enum: [...SAVE_ACTOR_TYPES, null], default: null },
    lastSavedById: { type: Schema.Types.ObjectId, default: null },
    lastSavedByName: { type: String, default: "" },

    submittedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },

    clientReviewNote: { type: String, default: "" },
    internalReviewNote: { type: String, default: "" },
    lockedRevision: { type: Number, default: null },
  },
  { timestamps: true, minimize: false },
);

CaseSmartFormSchema.index({ case: 1, templateKey: 1, templateVersion: 1 }, { unique: true });
CaseSmartFormSchema.index({ case: 1, status: 1, updatedAt: -1 });
CaseSmartFormSchema.index({ workspace: 1, updatedAt: -1 });

export const CaseSmartForm =
  mongoose.models.CaseSmartForm || mongoose.model("CaseSmartForm", CaseSmartFormSchema, "case_smart_forms");
