const mongoose = require('mongoose');
const { PETITION_KINDS, VERSION_REASONS, DEPENDENCY_TYPES } = require('../utils/petitionConstants');

/**
 * Immutable snapshot of a petition at approval or finalization (ADR-022 §15).
 * Holds the section text as reviewed plus, per dependency, the provenance a
 * later filing packet needs (which document VERSION, which Smart Form
 * revision) — never storage keys, checksums or file bytes. Refuses updates
 * and deletes at the model layer, like SmartFormAudit.
 */
const VersionSectionSchema = new mongoose.Schema(
  {
    key: String,
    title: String,
    order: Number,
    required: Boolean,
    body: String,
    reviewStatus: String,
    assignedToName: String,
    reviewedByName: String,
    reviewNote: String,
  },
  { _id: false },
);

const VersionDependencySchema = new mongoose.Schema(
  {
    type: { type: String, enum: DEPENDENCY_TYPES },
    refId: mongoose.Schema.Types.ObjectId,
    label: String,
    role: String,
    requiredForFinalization: Boolean,
    ready: Boolean,
    status: String,
    // Type-specific, safe-by-construction provenance (see petitionManagement.resolveDependencies).
    provenance: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const PetitionVersionSchema = new mongoose.Schema(
  {
    petition: { type: mongoose.Schema.Types.ObjectId, ref: 'CasePetition', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },

    versionNumber: { type: Number, required: true, min: 1 },
    reason: { type: String, enum: VERSION_REASONS, required: true },
    sourceRevision: { type: Number, required: true },

    kind: { type: String, enum: PETITION_KINDS },
    titleSnapshot: { type: String, required: true },
    statusSnapshot: { type: String, required: true },

    sections: [VersionSectionSchema],
    dependencies: [VersionDependencySchema],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PetitionVersionSchema.index({ petition: 1, versionNumber: 1 }, { unique: true });
PetitionVersionSchema.index({ case: 1, createdAt: -1 });

const refuse = () => {
  throw new Error('PetitionVersion is immutable.');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  PetitionVersionSchema.pre(op, refuse),
);
PetitionVersionSchema.pre('save', function immutable() {
  if (!this.isNew) refuse();
});

module.exports = mongoose.model('PetitionVersion', PetitionVersionSchema, 'petition_versions');
