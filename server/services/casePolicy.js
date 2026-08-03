const WorkspaceMember = require('../models/WorkspaceMember');
const { can, getRole } = require('../utils/permissions');

/**
 * Centralized row-level case/workspace authorization. Every case-scoped
 * route must go through one of these — never infer access from a role name
 * or from ClientCase.primaryClient/projectManager alone (see
 * 03_CLIENT_CASES_AND_WORKSPACES.md §13 and §"Employee policy").
 *
 * Design: every action requires BOTH a global capability AND (unless the
 * actor holds the org-wide `cases.view_all` capability) an active employee
 * WorkspaceMember for that case's primary workspace. In the conservative
 * default matrix (see utils/permissions.js), only super_admin/admin hold
 * `cases.view_all` — and they're also the only roles granted the
 * manage/assign/archive/members.manage capabilities, so using
 * `cases.view_all` as the single "organization-wide, no-membership-required"
 * signal for every case action (not just viewing) is deliberate, not an
 * oversight: it matches who the matrix actually grants those capabilities
 * to. If a future role gains a manage-tier capability without view_all,
 * this stops being equivalent and must be revisited explicitly.
 */

/** True if `req`'s admin user has an active employee membership for `workspaceId`. Fails closed on any missing identity. */
async function hasActiveEmployeeMembership(req, workspaceId) {
  const adminUserId = req.session && req.session.adminUser && req.session.adminUser.id;
  // The env-credential fallback admin has no persistent AdminUser id and so
  // can never hold a WorkspaceMember row — it can only act through the
  // cases.view_all org-wide bypass (role-based, not identity-based).
  if (!adminUserId || !workspaceId) return false;

  const membership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    adminUser: adminUserId,
    memberType: 'employee',
    status: 'active',
  }).lean();
  return !!membership;
}

/**
 * Core check shared by every action below. `capability` is the
 * action-specific capability (e.g. 'cases.manage'); membership is checked
 * against `workspaceId` unless the actor holds 'cases.view_all'.
 */
async function authorizeCaseAction(req, workspaceId, capability) {
  if (!getRole(req)) return false; // missing role fails closed
  if (!can(req, capability)) return false;
  if (can(req, 'cases.view_all')) return true;
  return hasActiveEmployeeMembership(req, workspaceId);
}

async function canViewCase(req, workspaceId) {
  return authorizeCaseAction(req, workspaceId, 'cases.view');
}

async function canManageCase(req, workspaceId) {
  return authorizeCaseAction(req, workspaceId, 'cases.manage');
}

async function canAssignCase(req, workspaceId) {
  return authorizeCaseAction(req, workspaceId, 'cases.assign');
}

async function canArchiveCase(req, workspaceId) {
  return authorizeCaseAction(req, workspaceId, 'cases.archive');
}

async function canViewWorkspace(req, workspaceId) {
  return canViewCase(req, workspaceId);
}

async function canManageWorkspaceMembers(req, workspaceId) {
  return authorizeCaseAction(req, workspaceId, 'workspace.members.manage');
}

/** Capability alone, independent of any specific case — used to decide whether to show the "Convert to case" action at all. */
function canCreateCase(req) {
  return can(req, 'cases.create');
}

module.exports = {
  hasActiveEmployeeMembership,
  canViewCase,
  canManageCase,
  canAssignCase,
  canArchiveCase,
  canViewWorkspace,
  canManageWorkspaceMembers,
  canCreateCase,
};
