const mongoose = require('mongoose');
const { FORM_STATUSES, SAVE_ACTOR_TYPES } = require('../utils/smartFormConstants');

/**
 * One case-owned instance of a published template version (ADR-021 §9).
 * Dual-writer: the Next.js portal saves/submits client answers, Express
 * handles provisioning, staff edits and the review lifecycle. Both write
 * through an atomic `revision` check (never document.save()), so a stale
 * write is a 409 rather than a silent overwrite.
 *
 * `answers` is keyed by the template's stable field keys. Locked forms keep
 * `lockedRevision`, the provenance a future USCIS generator will cite.
 */
const ProgressSchema = new mongoose.Schema(
  {
    completedRequired: { type: Number, default: 0 },
    totalRequired: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
  },
  { _id: false },
);

const CaseSmartFormSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartFormTemplate', required: true },
    templateKey: { type: String, required: true },
    templateVersion: { type: Number, required: true },
    templateTitleSnapshot: { type: String, required: true },

    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: FORM_STATUSES, default: 'draft' },
    revision: { type: Number, default: 1, min: 1 },
    progress: { type: ProgressSchema, default: () => ({}) },

    lastSavedAt: { type: Date, default: null },
    lastSavedByType: { type: String, enum: [...SAVE_ACTOR_TYPES, null], default: null },
    lastSavedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    lastSavedByName: { type: String, default: '' },

    submittedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    clientReviewNote: { type: String, default: '' },
    internalReviewNote: { type: String, default: '' },
    lockedRevision: { type: Number, default: null },
  },
  { timestamps: true, minimize: false },
);

CaseSmartFormSchema.index({ case: 1, templateKey: 1, templateVersion: 1 }, { unique: true });
CaseSmartFormSchema.index({ case: 1, status: 1, updatedAt: -1 });
CaseSmartFormSchema.index({ workspace: 1, updatedAt: -1 });

module.exports = mongoose.model('CaseSmartForm', CaseSmartFormSchema, 'case_smart_forms');
