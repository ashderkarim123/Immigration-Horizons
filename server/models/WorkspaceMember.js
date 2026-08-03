const mongoose = require('mongoose');
const {
  MEMBER_TYPES,
  WORKSPACE_ROLES,
  MEMBERSHIP_STATUSES,
  clientDisplayRoleLabel,
} = require('../utils/caseConstants');

/**
 * The row-level authorization boundary: a client or employee has access to
 * a case's workspace if and only if an *active* WorkspaceMember links them
 * to it. Never authorize from ClientCase.primaryClient or
 * ClientCase.projectManager alone — see server/services/casePolicy.js.
 */
const WorkspaceMemberSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    memberType: { type: String, enum: MEMBER_TYPES, required: true },

    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    workspaceRole: { type: String, enum: WORKSPACE_ROLES, required: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'invited' },

    joinedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },

    // Snapshot (name + type) of who added this member — not a hard
    // reference, so the record stays meaningful even if the inviter is
    // later removed. `invitedByType` covers the env-credential fallback
    // admin, which has no persistent AdminUser id (see
    // docs/architecture/ADR-002-case-workspace-domain.md).
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    invitedByName: { type: String, default: '' },
    invitedByType: { type: String, enum: ['admin_user', 'env_fallback', 'system'], default: 'system' },

    // Employee-membership-only display controls (module doc: "Employee
    // membership records should support controlling whether the employee
    // appears in the client portal"). Meaningless/ignored for memberType
    // 'client', whose display to the client portal is implicit (it's the
    // client's own case).
    clientVisible: { type: Boolean, default: true },
    displayRole: { type: String, default: '' },
  },
  { timestamps: true },
);

/**
 * Enforces the polymorphic identity invariant at the model layer, not just
 * in route handlers — exactly one of clientUser/adminUser must be present,
 * matching memberType. Runs on every save (create AND update), so a route
 * bug can't silently persist a member with the wrong identity shape.
 *
 * Mongoose 7+ dropped callback-style middleware (see models/admin/Task.js)
 * — a synchronous hook takes no `next` parameter and signals failure by
 * throwing directly, which Mongoose surfaces as the validation error.
 */
WorkspaceMemberSchema.pre('validate', function () {
  if (this.memberType === 'client') {
    if (!this.clientUser) throw new Error('memberType "client" requires clientUser.');
    if (this.adminUser) throw new Error('memberType "client" must not set adminUser.');
  } else if (this.memberType === 'employee') {
    if (!this.adminUser) throw new Error('memberType "employee" requires adminUser.');
    if (this.clientUser) throw new Error('memberType "employee" must not set clientUser.');
  }
});

WorkspaceMemberSchema.methods.clientFacingRoleLabel = function clientFacingRoleLabel() {
  return this.displayRole || clientDisplayRoleLabel(this.workspaceRole);
};

// Prevents duplicate memberships and is the reactivation lookup key: adding
// the same person back finds this same document (by workspace+identity)
// rather than creating an ambiguous second row — see
// services/workspaceMembership.js's addOrReactivateMember(). Partial so the
// index only applies where the relevant identity field is actually set,
// matching the polymorphic schema above.
WorkspaceMemberSchema.index(
  { workspace: 1, clientUser: 1 },
  { unique: true, partialFilterExpression: { clientUser: { $type: 'objectId' } } },
);
WorkspaceMemberSchema.index(
  { workspace: 1, adminUser: 1 },
  { unique: true, partialFilterExpression: { adminUser: { $type: 'objectId' } } },
);

WorkspaceMemberSchema.index({ clientUser: 1, status: 1 });
WorkspaceMemberSchema.index({ adminUser: 1, status: 1 });
WorkspaceMemberSchema.index({ workspace: 1, status: 1 });

module.exports = mongoose.model('WorkspaceMember', WorkspaceMemberSchema, 'workspace_members');
