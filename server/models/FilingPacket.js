const mongoose = require('mongoose');
const { PACKET_KINDS, PACKET_STATUSES, ITEM_TYPES, ITEM_ROLES } = require('../utils/filingPacketConstants');

/**
 * A case-owned, ordered filing MANIFEST (ADR-023 §5). A case may own several
 * (`unique {case, sequence}`). It pins exact versions: one finalized
 * PetitionVersion at packet level and, per item, an exact DocumentVersion or a
 * Smart Form reference with its revision. Nothing here follows
 * `CaseDocument.currentVersion` or a live petition after selection.
 *
 * Mutated only through services/filingPacketManagement.js with an atomic
 * `revision` check — never document.save(). No file bytes, storage keys or
 * URLs are stored; downloads go through the Phase 06 secure routes.
 */
const ItemSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  type: { type: String, enum: ITEM_TYPES, required: true },
  role: { type: String, enum: ITEM_ROLES, default: 'other' },
  labelSnapshot: { type: String, default: '' },
  required: { type: Boolean, default: true },

  document: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument', default: null },
  documentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },

  smartForm: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseSmartForm', default: null },
  smartFormRevision: { type: Number, default: null },
  smartFormLockedRevision: { type: Number, default: null },

  notes: { type: String, default: '' },
});

const FilingPacketSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },

    sequence: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: PACKET_KINDS, default: 'initial_filing' },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    status: { type: String, enum: PACKET_STATUSES, default: 'draft' },
    revision: { type: Number, default: 1, min: 1 },

    petitionVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'PetitionVersion', default: null },
    petitionVersionNumberSnapshot: { type: Number, default: null },
    petitionTitleSnapshot: { type: String, default: '' },

    items: { type: [ItemSchema], default: [] },

    internalReviewNote: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    lastEditedByName: { type: String, default: '' },

    readyAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    approvedByName: { type: String, default: '' },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    finalizedByName: { type: String, default: '' },
  },
  { timestamps: true },
);

FilingPacketSchema.index({ case: 1, sequence: 1 }, { unique: true });
FilingPacketSchema.index({ case: 1, status: 1, updatedAt: -1 });
FilingPacketSchema.index({ workspace: 1, updatedAt: -1 });

module.exports = mongoose.model('FilingPacket', FilingPacketSchema, 'filing_packets');
