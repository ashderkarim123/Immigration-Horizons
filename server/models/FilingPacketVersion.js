const mongoose = require('mongoose');
const { PACKET_KINDS, VERSION_REASONS, ITEM_TYPES, ITEM_ROLES } = require('../utils/filingPacketConstants');

/**
 * Immutable snapshot of a packet at finalization (ADR-023 §15): the exact
 * petition version, the exact document versions and Smart Form revisions, their
 * order, roles and required flags, plus a manifest hash. Holds identifiers and
 * display snapshots only — never storage keys, checksums, paths or bytes.
 * Refuses updates and deletes at the model layer, like PetitionVersion.
 */
const PetitionSourceSchema = new mongoose.Schema(
  {
    petitionVersionId: mongoose.Schema.Types.ObjectId,
    petitionId: mongoose.Schema.Types.ObjectId,
    versionNumber: Number,
    sourceRevision: Number,
    petitionKind: String,
    petitionTitle: String,
    createdAt: Date,
  },
  { _id: false },
);

const VersionItemSchema = new mongoose.Schema(
  {
    order: Number,
    type: { type: String, enum: ITEM_TYPES },
    role: { type: String, enum: ITEM_ROLES },
    required: Boolean,
    label: String,
    notes: String,
    // document_version
    documentId: mongoose.Schema.Types.ObjectId,
    documentVersionId: mongoose.Schema.Types.ObjectId,
    displayName: String,
    versionNumber: Number,
    mimeType: String,
    size: Number,
    categoryName: String,
    documentStatus: String,
    // smart_form_reference
    caseSmartFormId: mongoose.Schema.Types.ObjectId,
    templateKey: String,
    templateVersion: Number,
    revision: Number,
    lockedRevision: Number,
    status: String,
  },
  { _id: false },
);

const FilingPacketVersionSchema = new mongoose.Schema(
  {
    packet: { type: mongoose.Schema.Types.ObjectId, ref: 'FilingPacket', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },

    versionNumber: { type: Number, required: true, min: 1 },
    reason: { type: String, enum: VERSION_REASONS, required: true },
    sourceRevision: { type: Number, required: true },

    kind: { type: String, enum: PACKET_KINDS },
    titleSnapshot: { type: String, required: true },
    descriptionSnapshot: { type: String, default: '' },

    petitionSource: { type: PetitionSourceSchema, default: null },
    items: [VersionItemSchema],

    manifestHash: { type: String, required: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

FilingPacketVersionSchema.index({ packet: 1, versionNumber: 1 }, { unique: true });
FilingPacketVersionSchema.index({ case: 1, createdAt: -1 });

const refuse = () => {
  throw new Error('FilingPacketVersion is immutable.');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  FilingPacketVersionSchema.pre(op, refuse),
);
FilingPacketVersionSchema.pre('save', function immutable() {
  if (!this.isNew) refuse();
});

module.exports = mongoose.model('FilingPacketVersion', FilingPacketVersionSchema, 'filing_packet_versions');
