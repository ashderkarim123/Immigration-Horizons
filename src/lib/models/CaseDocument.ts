import "server-only";

import mongoose, { Schema } from "mongoose";

import {
  UPLOADED_BY_TYPE,
  DOCUMENT_VISIBILITY,
  DOCUMENT_STATUSES,
  SCAN_STATUSES,
} from "../content/document-constants";

/**
 * Mirrors server/models/CaseDocument.js — dual-writer (clients upload from
 * this app; employees upload/review/version/archive from Express), each
 * only ever setting the fields it owns. See
 * docs/architecture/ADR-004-secure-document-storage.md §1/§20.
 * `optimisticConcurrency: true` must match the server copy exactly, since
 * both apps write this collection.
 */
const CaseDocumentSchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    category: { type: Schema.Types.ObjectId, ref: "DocumentCategory", required: true },

    uploadedByType: { type: String, enum: UPLOADED_BY_TYPE, required: true },
    uploadedByClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    uploadedByAdmin: { type: Schema.Types.ObjectId, default: null },

    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    displayName: { type: String, required: true, trim: true, maxlength: 255 },
    storageKey: { type: String, required: true },

    mimeType: { type: String, required: true },
    detectedMimeType: { type: String, required: true },
    extension: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    checksum: { type: String, required: true },

    status: { type: String, enum: DOCUMENT_STATUSES, default: "uploaded" },
    visibility: { type: String, enum: DOCUMENT_VISIBILITY, required: true },

    scanStatus: { type: String, enum: SCAN_STATUSES, default: "not_configured" },
    scanProvider: { type: String, default: "none" },
    scanCompletedAt: { type: Date, default: null },
    scanMessage: { type: String, default: "" },

    currentVersion: { type: Schema.Types.ObjectId, ref: "DocumentVersion", default: null },
    versionCount: { type: Number, default: 0 },

    reviewedBy: { type: Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    clientVisibleReviewComment: { type: String, default: "", maxlength: 2000 },
    // Never read through any client-facing query projection in this app.
    internalReviewComment: { type: String, default: "", maxlength: 2000 },

    documentRequest: { type: Schema.Types.ObjectId, ref: "DocumentRequest", default: null },

    uploadedAt: { type: Date, default: Date.now },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

CaseDocumentSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.uploadedByType === "client") {
    if (!this.uploadedByClient) throw new Error('uploadedByType "client" requires uploadedByClient.');
    if (this.uploadedByAdmin) throw new Error('uploadedByType "client" must not set uploadedByAdmin.');
  } else if (this.uploadedByType === "employee") {
    if (!this.uploadedByAdmin) throw new Error('uploadedByType "employee" requires uploadedByAdmin.');
    if (this.uploadedByClient) throw new Error('uploadedByType "employee" must not set uploadedByClient.');
  }

  if (this.status === "accepted" && (!this.reviewedBy || !this.reviewedAt)) {
    throw new Error('status "accepted" requires reviewedBy and reviewedAt.');
  }
  if (this.status === "needs_replacement") {
    if (!this.reviewedBy || !this.reviewedAt) {
      throw new Error('status "needs_replacement" requires reviewedBy and reviewedAt.');
    }
    if (!this.clientVisibleReviewComment || !(this.clientVisibleReviewComment as string).trim()) {
      throw new Error('status "needs_replacement" requires a client-visible reason.');
    }
  }
  if (this.status === "rejected") {
    if (!this.reviewedBy || !this.reviewedAt) {
      throw new Error('status "rejected" requires reviewedBy and reviewedAt.');
    }
    if (!this.clientVisibleReviewComment || !(this.clientVisibleReviewComment as string).trim()) {
      throw new Error('status "rejected" requires a client-visible reason.');
    }
  }
  if (this.status === "archived" && !this.archivedAt) {
    throw new Error('status "archived" requires archivedAt.');
  }
});

CaseDocumentSchema.index({ case: 1, category: 1, status: 1, createdAt: -1 });
CaseDocumentSchema.index({ workspace: 1, status: 1, createdAt: -1 });
CaseDocumentSchema.index({ case: 1, checksum: 1 });
CaseDocumentSchema.index({ uploadedByClient: 1, createdAt: -1 });

export const CaseDocument =
  mongoose.models.CaseDocument || mongoose.model("CaseDocument", CaseDocumentSchema, "case_documents");
