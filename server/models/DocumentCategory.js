const mongoose = require('mongoose');
const { CATEGORY_VISIBILITY, CATEGORY_ALLOWED_UPLOADER_TYPES } = require('../utils/documentConstants');

/**
 * An ordered, per-case document category (identity documents, evidence,
 * filing package, etc). See
 * docs/architecture/ADR-004-secure-document-storage.md.
 *
 * `workspace` is a denormalized convenience copy of the case's primary
 * workspace (set at creation, never re-derived) purely for the index shape
 * the module doc calls for (`workspace + active + order`) — `case` remains
 * the source of truth for category identity/uniqueness.
 */
const DocumentCategorySchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', default: null },

    // Null for a fully custom category a manager added beyond the default
    // template; set for anything provisioned from DEFAULT_CATEGORY_TEMPLATE.
    templateKey: { type: String, default: null },

    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 150 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    order: { type: Number, required: true },

    visibility: { type: String, enum: CATEGORY_VISIBILITY, required: true },
    allowedUploaderTypes: { type: String, enum: CATEGORY_ALLOWED_UPLOADER_TYPES, required: true },
    required: { type: Boolean, default: false },
    active: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

DocumentCategorySchema.index({ case: 1, slug: 1 }, { unique: true });
// No duplicate active order within one case (module doc §10) — disabled
// categories are excluded so a slot can be reused once its old occupant is
// disabled, without a manual renumber.
DocumentCategorySchema.index(
  { case: 1, order: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
DocumentCategorySchema.index({ case: 1, templateKey: 1 });
DocumentCategorySchema.index({ case: 1, active: 1, order: 1 });
DocumentCategorySchema.index({ workspace: 1, active: 1, order: 1 });

module.exports = mongoose.model('DocumentCategory', DocumentCategorySchema, 'document_categories');
