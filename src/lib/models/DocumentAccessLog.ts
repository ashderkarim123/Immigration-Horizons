import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Mirrors server/models/DocumentAccessLog.js. Both apps write here — every
 * download, from either app, is logged. See
 * docs/architecture/ADR-004-secure-document-storage.md §16.
 */
const DocumentAccessLogSchema = new Schema(
  {
    document: { type: Schema.Types.ObjectId, ref: "CaseDocument", required: true },
    version: { type: Schema.Types.ObjectId, ref: "DocumentVersion", default: null },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },

    actorType: { type: String, enum: ["client", "admin_user", "env_fallback", "system"], required: true },
    actorClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    actorAdmin: { type: Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: "" },

    result: { type: String, enum: ["success", "denied", "not_found"], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

DocumentAccessLogSchema.index({ document: 1, createdAt: -1 });
DocumentAccessLogSchema.index({ case: 1, createdAt: -1 });
DocumentAccessLogSchema.index({ actorClient: 1, createdAt: -1 });

export const DocumentAccessLog =
  mongoose.models.DocumentAccessLog ||
  mongoose.model("DocumentAccessLog", DocumentAccessLogSchema, "document_access_logs");
