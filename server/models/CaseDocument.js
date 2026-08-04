const mongoose = require('mongoose');
const { UPLOADED_BY_TYPE, DOCUMENT_VISIBILITY, DOCUMENT_STATUSES, SCAN_STATUSES } = require('../utils/documentConstants');

/**
 * A private, per-case document. See
 * docs/architecture/ADR-004-secure-document-storage.md. Dual-writer, same
 * shape as ConsultationInteraction (ADR-003 §1): clients upload from the
 * Next.js portal, employees upload/review/version/archive from Express,
 * never the same fields.
 *
 * `optimisticConcurrency: true` (not the non-functional default `__v` —
 * see ADR-003 §2's empirical finding, which applies identically here)
 * protects concurrent review/replacement races on the same document.
 */
const CaseDocumentSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCategory', required: true },

    uploadedByType: { type: String, enum: UPLOADED_BY_TYPE, required: true },
    uploadedByClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    uploadedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    displayName: { type: String, required: true, trim: true, maxlength: 255 },
    storageKey: { type: String, required: true },

    mimeType: { type: String, required: true },
    detectedMimeType: { type: String, required: true },
    extension: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    checksum: { type: String, required: true },

    status: { type: String, enum: DOCUMENT_STATUSES, default: 'uploaded' },
    visibility: { type: String, enum: DOCUMENT_VISIBILITY, required: true },

    scanStatus: { type: String, enum: SCAN_STATUSES, default: 'not_configured' },
    scanProvider: { type: String, default: 'none' },
    scanCompletedAt: { type: Date, default: null },
    scanMessage: { type: String, default: '' },

    currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    versionCount: { type: Number, default: 0 },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedAt: { type: Date, default: null },
    // Shown to the client — required for needs_replacement/rejected.
    clientVisibleReviewComment: { type: String, default: '', maxlength: 2000 },
    // Never returned through any client-facing path.
    internalReviewComment: { type: String, default: '', maxlength: 2000 },

    documentRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentRequest', default: null },

    uploadedAt: { type: Date, default: Date.now },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

CaseDocumentSchema.pre('validate', function () {
  if (this.uploadedByType === 'client') {
    if (!this.uploadedByClient) throw new Error('uploadedByType "client" requires uploadedByClient.');
    if (this.uploadedByAdmin) throw new Error('uploadedByType "client" must not set uploadedByAdmin.');
  } else if (this.uploadedByType === 'employee') {
    if (!this.uploadedByAdmin) throw new Error('uploadedByType "employee" requires uploadedByAdmin.');
    if (this.uploadedByClient) throw new Error('uploadedByType "employee" must not set uploadedByClient.');
  }

  if (this.status === 'accepted' && (!this.reviewedBy || !this.reviewedAt)) {
    throw new Error('status "accepted" requires reviewedBy and reviewedAt.');
  }
  if (this.status === 'needs_replacement') {
    if (!this.reviewedBy || !this.reviewedAt) {
      throw new Error('status "needs_replacement" requires reviewedBy and reviewedAt.');
    }
    if (!this.clientVisibleReviewComment || !this.clientVisibleReviewComment.trim()) {
      throw new Error('status "needs_replacement" requires a client-visible reason.');
    }
  }
  if (this.status === 'rejected') {
    if (!this.reviewedBy || !this.reviewedAt) {
      throw new Error('status "rejected" requires reviewedBy and reviewedAt.');
    }
    if (!this.clientVisibleReviewComment || !this.clientVisibleReviewComment.trim()) {
      throw new Error('status "rejected" requires a client-visible reason.');
    }
  }
  if (this.status === 'archived' && !this.archivedAt) {
    throw new Error('status "archived" requires archivedAt.');
  }
});

CaseDocumentSchema.index({ case: 1, category: 1, status: 1, createdAt: -1 });
CaseDocumentSchema.index({ workspace: 1, status: 1, createdAt: -1 });
CaseDocumentSchema.index({ category: 1, status: 1, createdAt: -1 });
CaseDocumentSchema.index({ case: 1, checksum: 1 });
CaseDocumentSchema.index({ documentRequest: 1 });
CaseDocumentSchema.index({ uploadedByClient: 1, createdAt: -1 });
CaseDocumentSchema.index({ uploadedByAdmin: 1, createdAt: -1 });
CaseDocumentSchema.index({ status: 1, reviewedAt: -1 });
CaseDocumentSchema.index({ archivedAt: 1 });

module.exports = mongoose.model('CaseDocument', CaseDocumentSchema, 'case_documents');
