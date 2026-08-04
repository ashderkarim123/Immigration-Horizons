import "server-only";

import mongoose, { Schema } from "mongoose";

import { UPLOADED_BY_TYPE, SCAN_STATUSES } from "../content/document-constants";

/** Mirrors server/models/DocumentVersion.js — immutable, dual-writer. */
const DocumentVersionSchema = new Schema(
  {
    document: { type: Schema.Types.ObjectId, ref: "CaseDocument", required: true },
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
    uploadedByClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    uploadedByAdmin: { type: Schema.Types.ObjectId, default: null },

    changeNote: { type: String, default: "", maxlength: 500 },
    scanStatus: { type: String, enum: SCAN_STATUSES, default: "not_configured" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

DocumentVersionSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.uploadedByType === "client") {
    if (!this.uploadedByClient) throw new Error('uploadedByType "client" requires uploadedByClient.');
    if (this.uploadedByAdmin) throw new Error('uploadedByType "client" must not set uploadedByAdmin.');
  } else if (this.uploadedByType === "employee") {
    if (!this.uploadedByAdmin) throw new Error('uploadedByType "employee" requires uploadedByAdmin.');
    if (this.uploadedByClient) throw new Error('uploadedByType "employee" must not set uploadedByClient.');
  }
});

DocumentVersionSchema.index({ document: 1, versionNumber: 1 }, { unique: true });
DocumentVersionSchema.index({ document: 1, createdAt: -1 });

export const DocumentVersion =
  mongoose.models.DocumentVersion || mongoose.model("DocumentVersion", DocumentVersionSchema, "document_versions");
