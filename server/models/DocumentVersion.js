const mongoose = require('mongoose');
const { UPLOADED_BY_TYPE, SCAN_STATUSES } = require('../utils/documentConstants');

/**
 * An immutable version of a CaseDocument. See
 * docs/architecture/ADR-004-secure-document-storage.md §20. No route in
 * either app updates a version after creation — replacement always creates
 * a new row, never mutates an existing one.
 */
const DocumentVersionSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument', required: true },
    versionNumber: { type: Number, required: true, min: 1 },

    storageKey: { type: String, required: true },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    displayName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    detectedMimeType: { type: String, required: true },
    extension: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    checksum: { type: String, required: true },

    uploadedByType: { type: String, enum: UPLOADED_BY_TYPE, required: true },
    uploadedByClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    uploadedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    changeNote: { type: String, default: '', maxlength: 500 },
    scanStatus: { type: String, enum: SCAN_STATUSES, default: 'not_configured' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

DocumentVersionSchema.pre('validate', function () {
  if (this.uploadedByType === 'client') {
    if (!this.uploadedByClient) throw new Error('uploadedByType "client" requires uploadedByClient.');
    if (this.uploadedByAdmin) throw new Error('uploadedByType "client" must not set uploadedByAdmin.');
  } else if (this.uploadedByType === 'employee') {
    if (!this.uploadedByAdmin) throw new Error('uploadedByType "employee" requires uploadedByAdmin.');
    if (this.uploadedByClient) throw new Error('uploadedByType "employee" must not set uploadedByClient.');
  }
});

DocumentVersionSchema.index({ document: 1, versionNumber: 1 }, { unique: true });
DocumentVersionSchema.index({ document: 1, createdAt: -1 });
// Deliberately non-unique — module doc §17/§29: "Do not create a globally
// unique checksum index," this is a lookup aid only.
DocumentVersionSchema.index({ checksum: 1 });

module.exports = mongoose.model('DocumentVersion', DocumentVersionSchema, 'document_versions');
