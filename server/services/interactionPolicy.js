const WorkspaceMember = require('../models/WorkspaceMember');
const { can, getRole } = require('../utils/permissions');

/**
 * Centralized row-level authorization for ConsultationInteraction — see
 * docs/architecture/ADR-003-consultation-interactions.md §7.
 *
 * Case-scoped interactions: identical shape to services/casePolicy.js
 * (capability + active workspace membership, `queries.view_all` bypasses
 * membership).
 *
 * Consultation-scoped interactions: this app's leads have no per-lead row
 * restriction today (`leads.view` is granted to every role, unconditional
 * — verified in utils/permissions.js). Rather than inventing a stricter
 * rule for interactions that doesn't exist for the leads they originate
 * from, holding the relevant `queries.*` capability is sufficient for any
 * consultation-scoped interaction — matching that existing convention
 * exactly (module doc's own "or existing authorized lead access" option).
 */

async function hasActiveEmployeeMembership(req, workspaceId) {
  const adminUserId = req.session && req.session.adminUser && req.session.adminUser.id;
  if (!adminUserId || !workspaceId) return false;
  const membership = await WorkspaceMember.findOne({
    workspace: workspaceId,
    adminUser: adminUserId,
    memberType: 'employee',
    status: 'active',
  }).lean();
  return !!membership;
}

async function authorizeInteractionAction(req, interaction, capability) {
  if (!getRole(req)) return false;
  if (!can(req, capability)) return false;

  if (interaction.scopeType === 'case') {
    if (can(req, 'queries.view_all')) return true;
    return hasActiveEmployeeMembership(req, interaction.workspace);
  }

  // Consultation scope: capability alone is sufficient (see module comment above).
  return true;
}

async function canViewInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.view');
}

async function canAssignInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.assign');
}

async function canScheduleInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.schedule');
}

async function canAnswerInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.answer');
}

async function canManageInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.manage');
}

async function canCloseInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.close');
}

async function canTriageInteraction(req, interaction) {
  return authorizeInteractionAction(req, interaction, 'queries.triage');
}

/** Employee-authored internal InteractionUpdate — same gate as viewing. */
async function canAddInteractionUpdate(req, interaction) {
  return canViewInteraction(req, interaction);
}

function canCreateInteraction(req) {
  return can(req, 'queries.create');
}

module.exports = {
  hasActiveEmployeeMembership,
  canViewInteraction,
  canAssignInteraction,
  canScheduleInteraction,
  canAnswerInteraction,
  canManageInteraction,
  canCloseInteraction,
  canTriageInteraction,
  canAddInteractionUpdate,
  canCreateInteraction,
};
