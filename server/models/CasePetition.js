const mongoose = require('mongoose');
const {
  PETITION_KINDS,
  PETITION_STATUSES,
  SECTION_REVIEW_STATUSES,
  DEPENDENCY_TYPES,
  DOCUMENT_DEPENDENCY_ROLES,
} = require('../utils/petitionConstants');

/**
 * A case-owned petition workspace (ADR-022 §5). A case may own several
 * (`unique {case, sequence}`), so an RFE response or supplemental filing is
 * not a redesign. Mutated only through services/petitionManagement.js with an
 * atomic `revision` check — never document.save() — so a stale write is a 409.
 *
 * Section text is PLAIN text. Dependencies are references to existing
 * case-scoped records (evidence, Smart Form, secure CaseDocument, Task) —
 * never file URLs and never a second copy of a work product.
 */
const SectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    order: { type: Number, required: true },
    required: { type: Boolean, default: true },
    body: { type: String, default: '' },
    reviewStatus: { type: String, enum: SECTION_REVIEW_STATUSES, default: 'draft' },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    assignedToName: { type: String, default: '' },

    lastEditedAt: { type: Date, default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    lastEditedByName: { type: String, default: '' },

    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedByName: { type: String, default: '' },
    reviewNote: { type: String, default: '' },
  },
  { _id: false },
);

const DependencySchema = new mongoose.Schema({
  type: { type: String, enum: DEPENDENCY_TYPES, required: true },
  refId: { type: mongoose.Schema.Types.ObjectId, required: true },
  labelSnapshot: { type: String, default: '' },
  role: { type: String, enum: [...DOCUMENT_DEPENDENCY_ROLES, null], default: null },
  requiredForFinalization: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const CasePetitionSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },

    sequence: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: PETITION_KINDS, default: 'primary' },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    status: { type: String, enum: PETITION_STATUSES, default: 'drafting' },
    revision: { type: Number, default: 1, min: 1 },

    sections: { type: [SectionSchema], default: [] },
    dependencies: { type: [DependencySchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    lastEditedByName: { type: String, default: '' },

    submittedForReviewAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    internalReviewNote: { type: String, default: '' },
  },
  { timestamps: true },
);

CasePetitionSchema.index({ case: 1, sequence: 1 }, { unique: true });
CasePetitionSchema.index({ case: 1, status: 1, updatedAt: -1 });
CasePetitionSchema.index({ workspace: 1, updatedAt: -1 });

module.exports = mongoose.model('CasePetition', CasePetitionSchema, 'case_petitions');
