const mongoose = require('mongoose');
const { CHANNEL_TYPES, CHANNEL_VISIBILITY } = require('../utils/collaborationConstants');

/**
 * An ordered, per-workspace collaboration channel. See
 * docs/architecture/ADR-005-team-collaboration.md. Visibility is checked
 * server-side on every read/write — never inferred from `name`/`slug`.
 *
 * `case` is a denormalized convenience copy of `workspace.case` (set at
 * creation, never re-derived) purely for the index shape the module doc
 * calls for (`case + archivedAt`) — `workspace` remains the source of
 * truth for channel identity/uniqueness, same pattern as
 * DocumentCategory's `workspace` field (ADR-004).
 */
const WorkspaceChannelSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },

    // Null for a fully custom channel a manager added beyond the default
    // template; set for anything provisioned from DEFAULT_CHANNEL_TEMPLATE.
    templateKey: { type: String, default: null },

    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
    description: { type: String, default: '', trim: true, maxlength: 500 },

    channelType: { type: String, enum: CHANNEL_TYPES, required: true },
    visibility: { type: String, enum: CHANNEL_VISIBILITY, required: true },
    order: { type: Number, required: true },

    createdByType: { type: String, enum: ['admin_user', 'env_fallback', 'system'], default: 'system' },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// No duplicate active slug within one workspace — archived channels keep
// their historical slug rather than freeing it immediately, since a
// future channel with the same name should get its own record, not be
// confused with archived history.
WorkspaceChannelSchema.index(
  { workspace: 1, slug: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);
WorkspaceChannelSchema.index(
  { workspace: 1, order: 1 },
  { unique: true, partialFilterExpression: { archivedAt: null } },
);
WorkspaceChannelSchema.index({ workspace: 1, archivedAt: 1, order: 1 });
WorkspaceChannelSchema.index({ case: 1, archivedAt: 1 });
WorkspaceChannelSchema.index({ workspace: 1, templateKey: 1 });

module.exports = mongoose.model('WorkspaceChannel', WorkspaceChannelSchema, 'workspace_channels');
