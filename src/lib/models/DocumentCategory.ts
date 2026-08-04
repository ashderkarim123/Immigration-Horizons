import "server-only";

import mongoose, { Schema } from "mongoose";

import { CATEGORY_VISIBILITY, CATEGORY_ALLOWED_UPLOADER_TYPES } from "../content/document-constants";

/**
 * Mirrors server/models/DocumentCategory.js — see
 * docs/architecture/ADR-004-secure-document-storage.md. This app is
 * read-only against DocumentCategory (client document center lists
 * categories; only employees create/reorder/disable them).
 */
const DocumentCategorySchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", default: null },

    templateKey: { type: String, default: null },

    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 150 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    order: { type: Number, required: true },

    visibility: { type: String, enum: CATEGORY_VISIBILITY, required: true },
    allowedUploaderTypes: { type: String, enum: CATEGORY_ALLOWED_UPLOADER_TYPES, required: true },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },

    createdBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

DocumentCategorySchema.index({ case: 1, slug: 1 }, { unique: true });
DocumentCategorySchema.index({ case: 1, order: 1 }, { unique: true, partialFilterExpression: { active: true } });
DocumentCategorySchema.index({ case: 1, active: 1, order: 1 });

export const DocumentCategory =
  mongoose.models.DocumentCategory ||
  mongoose.model("DocumentCategory", DocumentCategorySchema, "document_categories");
