const mongoose = require('mongoose');
const { WORKSPACE_STATUSES, WORKSPACE_TYPES } = require('../utils/caseConstants');

/**
 * The collaboration and row-level authorization boundary for one case.
 * Every case gets exactly one "primary" workspace at conversion time — the
 * schema does not prevent additional workspaces per case in a later cycle
 * (e.g. a restricted sub-workspace), but nothing in this cycle creates one.
 */
const CaseWorkspaceSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: WORKSPACE_STATUSES, default: 'active' },
    workspaceType: { type: String, enum: WORKSPACE_TYPES, default: 'primary' },
    // Free-form, forward-compatible bag for later per-workspace settings
    // (e.g. notification preferences) — deliberately untyped rather than
    // guessing a shape no feature needs yet.
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

// Exactly one primary workspace per case — a repeated conversion/
// provisioning attempt hitting this index is what makes "no duplicate
// primary workspaces" a database guarantee, not just an application check.
CaseWorkspaceSchema.index(
  { case: 1, workspaceType: 1 },
  { unique: true, partialFilterExpression: { workspaceType: 'primary' } },
);

module.exports = mongoose.model('CaseWorkspace', CaseWorkspaceSchema, 'case_workspaces');
