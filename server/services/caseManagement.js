const mongoose = require('mongoose');

const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const CaseActivity = require('../models/CaseActivity');
const WorkspaceMember = require('../models/WorkspaceMember');
const AdminUser = require('../models/admin/User');
const ClientUser = require('../models/ClientUser');
const { notify } = require('../utils/notify');
const { CASE_STAGE_VALUES, CLIENT_STAGE_LABELS } = require('../utils/caseConstants');
const { addOrReactivateMember, removeMember } = require('./workspaceMembership');
const {
  emitMemberAddedMessage,
  emitCaseStageChangedMessage,
} = require('./systemMessageService');

/** Loads a case + its primary workspace together, or null if either is missing. */
async function loadCaseAndWorkspace(caseId) {
  if (!mongoose.Types.ObjectId.isValid(caseId)) return null;
  const caseDoc = await ClientCase.findById(caseId);
  if (!caseDoc) return null;
  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: 'primary' });
  if (!workspace) return null;
  return { caseDoc, workspace };
}

/** Stage update — validates the destination, audits previous/new, no-ops (no duplicate audit entry) when unchanged. */
async function updateStage({ caseDoc, workspace, newStage, actor }) {
  if (!CASE_STAGE_VALUES.includes(newStage)) {
    return { outcome: 'validation_error', errors: { stage: 'Invalid stage.' } };
  }
  if (caseDoc.currentStage === newStage) {
    return { outcome: 'unchanged', case: caseDoc };
  }

  const previousStage = caseDoc.currentStage;
  caseDoc.currentStage = newStage;
  await caseDoc.save();

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: 'stage_changed',
    message: `Stage changed from "${previousStage}" to "${newStage}" by ${actor.name}.`,
    actor,
    meta: { previousStage, newStage },
  });

  await emitCaseStageChangedMessage({
    workspaceId: workspace._id,
    caseId: caseDoc._id,
    clientStageLabel: CLIENT_STAGE_LABELS[newStage] || newStage,
    changedAtIso: caseDoc.updatedAt ? caseDoc.updatedAt.toISOString() : new Date().toISOString(),
  });

  return { outcome: 'updated', case: caseDoc };
}

/**
 * Changes the project manager. Ensures the new manager holds an active
 * `project_manager` membership and adjusts the previous manager's role to
 * 'contributor' (documented rule: a former PM keeps case access as a
 * regular team member rather than losing it outright, since removal is a
 * separate, explicit action) — never leaves two people simultaneously
 * holding the project_manager workspace role.
 */
async function changeProjectManager({ caseDoc, workspace, newManagerId, actor }) {
  if (!mongoose.Types.ObjectId.isValid(newManagerId)) {
    return { outcome: 'validation_error', errors: { projectManagerId: 'Invalid project manager.' } };
  }
  const newManager = await AdminUser.findOne({ _id: newManagerId, isActive: true });
  if (!newManager) {
    return { outcome: 'validation_error', errors: { projectManagerId: 'Not a valid, active team member.' } };
  }
  if (String(caseDoc.projectManager) === String(newManager._id)) {
    return { outcome: 'unchanged', case: caseDoc };
  }

  const previousManagerId = caseDoc.projectManager;

  caseDoc.projectManager = newManager._id;
  await caseDoc.save();

  await addOrReactivateMember({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: newManager._id,
    workspaceRole: 'project_manager',
    status: 'active',
    invitedBy: actor.id,
    invitedByName: actor.name,
    invitedByType: actor.type,
  });

  if (previousManagerId && String(previousManagerId) !== String(newManager._id)) {
    const previousMembership = await WorkspaceMember.findOne({
      workspace: workspace._id,
      adminUser: previousManagerId,
      memberType: 'employee',
      status: 'active',
    });
    if (previousMembership && previousMembership.workspaceRole === 'project_manager') {
      previousMembership.workspaceRole = 'contributor';
      await previousMembership.save();
    }
  }

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: 'project_manager_changed',
    message: `Project manager changed to ${newManager.name} by ${actor.name}.`,
    actor,
    meta: { previousManagerId: previousManagerId ? String(previousManagerId) : null, newManagerId: String(newManager._id) },
  });

  await notify({
    recipientName: newManager.name,
    title: `Assigned as project manager: ${caseDoc.caseNumber}`,
    message: `You were assigned as project manager for "${caseDoc.title}".`,
    type: 'case_assigned_manager',
    relatedCase: caseDoc._id,
  });

  return { outcome: 'updated', case: caseDoc };
}

/** Archives a case — non-destructive: status/archivedAt/currentStage only, workspace and memberships untouched (members retain read-only historical access, since membership status is not itself changed). */
async function archiveCase({ caseDoc, workspace, actor }) {
  if (caseDoc.archivedAt) {
    return { outcome: 'unchanged', case: caseDoc };
  }
  caseDoc.archivedAt = new Date();
  caseDoc.currentStage = 'archived';
  await caseDoc.save(); // pre-save hook also flips `status` to 'archived'

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: 'case_archived',
    message: `Case archived by ${actor.name}.`,
    actor,
  });

  return { outcome: 'archived', case: caseDoc };
}

/** Adds (or reactivates) an employee member. */
async function addEmployeeMember({ caseDoc, workspace, adminUserId, workspaceRole, clientVisible, actor }) {
  if (!mongoose.Types.ObjectId.isValid(adminUserId)) {
    return { outcome: 'validation_error', errors: { adminUserId: 'Invalid team member.' } };
  }
  const adminUser = await AdminUser.findOne({ _id: adminUserId, isActive: true });
  if (!adminUser) {
    return { outcome: 'validation_error', errors: { adminUserId: 'Not a valid, active team member.' } };
  }

  const existing = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: adminUser._id });
  const wasRemoved = existing && existing.status === 'removed';

  const member = await addOrReactivateMember({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: adminUser._id,
    workspaceRole: workspaceRole || 'contributor',
    status: 'active',
    clientVisible: clientVisible !== undefined ? clientVisible : true,
    invitedBy: actor.id,
    invitedByName: actor.name,
    invitedByType: actor.type,
  });

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: wasRemoved ? 'member_reactivated' : 'employee_membership_created',
    message: `${adminUser.name} ${wasRemoved ? 're-added' : 'added'} to the case workspace by ${actor.name}.`,
    actor,
    targetMember: member._id,
  });

  await notify({
    recipientName: adminUser.name,
    title: `Added to case ${caseDoc.caseNumber}`,
    message: `You were added to the workspace for "${caseDoc.title}".`,
    type: 'case_member_added',
    relatedCase: caseDoc._id,
  });

  if (!wasRemoved) {
    await emitMemberAddedMessage({ workspaceId: workspace._id, workspaceMemberId: member._id, memberDisplayName: adminUser.name });
  }

  return { outcome: 'added', member };
}

/** Adds (or reactivates) a client member — used for adding an additional client to an existing case. */
async function addClientMember({ caseDoc, workspace, clientUserId, actor }) {
  if (!mongoose.Types.ObjectId.isValid(clientUserId)) {
    return { outcome: 'validation_error', errors: { clientUserId: 'Invalid client.' } };
  }
  const clientUser = await ClientUser.findOne({ _id: clientUserId, status: { $ne: 'disabled' } });
  if (!clientUser) {
    return { outcome: 'validation_error', errors: { clientUserId: 'Not a valid client account.' } };
  }

  const existing = await WorkspaceMember.findOne({ workspace: workspace._id, clientUser: clientUser._id });
  const wasRemoved = existing && existing.status === 'removed';

  const member = await addOrReactivateMember({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: clientUser._id,
    workspaceRole: 'client',
    status: clientUser.status === 'active' ? 'active' : 'invited',
    invitedBy: actor.id,
    invitedByName: actor.name,
    invitedByType: actor.type,
  });

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: wasRemoved ? 'member_reactivated' : 'client_membership_created',
    message: `${clientUser.email} ${wasRemoved ? 're-added' : 'added'} to the case workspace by ${actor.name}.`,
    actor,
    targetMember: member._id,
  });

  if (!wasRemoved) {
    await emitMemberAddedMessage({
      workspaceId: workspace._id,
      workspaceMemberId: member._id,
      memberDisplayName: clientUser.firstName || clientUser.email,
    });
  }

  return { outcome: 'added', member };
}

/**
 * Removes a member. Refuses to remove the current primary client or the
 * current project manager without an explicit replacement/transfer step
 * first — matching the module document's stated invariant (no future
 * case-transfer workflow exists yet to safely replace a removed primary
 * client, and a case must not silently lose its project manager).
 */
async function removeMemberFromCase({ caseDoc, workspace, memberId, actor }) {
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return { outcome: 'validation_error', errors: { memberId: 'Invalid member.' } };
  }
  const member = await WorkspaceMember.findOne({ _id: memberId, workspace: workspace._id });
  if (!member || member.status === 'removed') {
    return { outcome: 'not_found' };
  }

  if (member.memberType === 'client' && String(member.clientUser) === String(caseDoc.primaryClient)) {
    return {
      outcome: 'validation_error',
      errors: { memberId: 'Cannot remove the primary client — transfer the case first.' },
    };
  }
  if (member.memberType === 'employee' && String(member.adminUser) === String(caseDoc.projectManager)) {
    return {
      outcome: 'validation_error',
      errors: { memberId: 'Cannot remove the current project manager — assign a replacement first.' },
    };
  }

  await removeMember(member._id);

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: 'member_removed',
    message: `Member removed from the case workspace by ${actor.name}.`,
    actor,
    targetMember: member._id,
  });

  return { outcome: 'removed' };
}

module.exports = {
  loadCaseAndWorkspace,
  updateStage,
  changeProjectManager,
  archiveCase,
  addEmployeeMember,
  addClientMember,
  removeMemberFromCase,
};
