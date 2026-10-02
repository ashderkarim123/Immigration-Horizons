const WorkspaceMember = require('../models/WorkspaceMember');
const ChannelMember = require('../models/ChannelMember');
const { can, getRole } = require('../utils/permissions');
const { hasActiveEmployeeMembership } = require('./casePolicy');
const { MESSAGE_EDIT_WINDOW_MS } = require('../utils/collaborationConstants');

/**
 * Centralized row-level collaboration authorization (employee side). Two
 * layers, composed, never skipped (ADR-005 §5): active WorkspaceMember is
 * required for every channel; an active ChannelMember is *additionally*
 * required only for `restricted_members` channels. See
 * docs/architecture/ADR-005-team-collaboration.md §6 and
 * 06_TEAM_COLLABORATION_AND_CHAT.md §23.
 */

async function hasActiveRestrictedChannelMembership(req, channel) {
  const adminUserId = (req.session && req.session.adminUser && req.session.adminUser.id) || (req.staff && req.staff._id);
  if (!adminUserId) return false; // env-fallback has no persistent id — cannot hold a ChannelMember row
  const workspaceMember = await WorkspaceMember.findOne({
    workspace: channel.workspace,
    adminUser: adminUserId,
    memberType: 'employee',
    status: 'active',
  }).lean();
  if (!workspaceMember) return false;
  const channelMember = await ChannelMember.findOne({
    channel: channel._id,
    workspaceMember: workspaceMember._id,
    status: 'active',
  }).lean();
  return !!channelMember;
}

/** Base access check shared by every channel/message action — workspace membership plus, for restricted channels, ChannelMember. */
async function hasChannelAccess(req, channel) {
  if (!getRole(req)) return false;
  const orgWide = can(req, 'channels.view_all');
  if (!orgWide) {
    const hasMembership = await hasActiveEmployeeMembership(req, channel.workspace);
    if (!hasMembership) return false;
  }
  if (channel.visibility === 'restricted_members' && !orgWide) {
    return hasActiveRestrictedChannelMembership(req, channel);
  }
  return true;
}

async function canViewChannel(req, channel) {
  if (!can(req, 'channels.view')) return false;
  return hasChannelAccess(req, channel);
}

async function canCreateChannel(req, workspaceId) {
  if (!can(req, 'channels.create')) return false;
  if (can(req, 'channels.view_all')) return true;
  return hasActiveEmployeeMembership(req, workspaceId);
}

async function canManageChannel(req, channel) {
  if (!can(req, 'channels.manage')) return false;
  return hasChannelAccess(req, channel);
}

async function canArchiveChannel(req, channel) {
  if (!can(req, 'channels.archive')) return false;
  return hasChannelAccess(req, channel);
}

async function canManageChannelMembers(req, channel) {
  if (!can(req, 'channel_members.manage')) return false;
  return hasChannelAccess(req, channel);
}

async function canSendMessage(req, channel) {
  if (!can(req, 'messages.send')) return false;
  return hasChannelAccess(req, channel);
}

async function canReplyToMessage(req, channel) {
  return canSendMessage(req, channel);
}

function isOwnEmployeeMessage(req, message) {
  const adminUserId = (req.session && req.session.adminUser && req.session.adminUser.id) || (req.staff && req.staff._id);
  return message.senderType === 'employee' && !!adminUserId && String(message.senderAdmin) === String(adminUserId);
}

/**
 * Capability + ownership + edit-window rules, WITHOUT the channel-access
 * layer — synchronous so a message list can compute per-message flags after
 * one hasChannelAccess() call instead of one per row. canEditMessage /
 * canDeleteMessage below are these rules plus channel access.
 */
function editRule(req, message) {
  if (message.deletedAt) return false;
  if (isOwnEmployeeMessage(req, message)) {
    return can(req, 'messages.edit_own') && Date.now() - new Date(message.createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS;
  }
  return can(req, 'messages.moderate');
}

function deleteRule(req, message) {
  if (message.deletedAt) return false;
  if (isOwnEmployeeMessage(req, message)) return can(req, 'messages.edit_own');
  return can(req, 'messages.moderate');
}

async function canEditMessage(req, channel, message) {
  return editRule(req, message) && hasChannelAccess(req, channel);
}

async function canDeleteMessage(req, channel, message) {
  return deleteRule(req, message) && hasChannelAccess(req, channel);
}

async function canModerateMessage(req, channel) {
  if (!can(req, 'messages.moderate')) return false;
  return hasChannelAccess(req, channel);
}

async function canViewMessageRevisions(req, channel) {
  if (!can(req, 'messages.view_revisions')) return false;
  return hasChannelAccess(req, channel);
}

/**
 * Document must belong to the same case as the channel, must be in a
 * downloadable state, and a channel a client can read may only carry a
 * client-visible document (module doc §16 attachment rules 2-4; ADR-020 §11).
 * `clientAudience` overrides the visibility-derived default — a
 * restricted_members channel is client-readable only when a client holds a
 * ChannelMember row, which the async caller resolves.
 * Capability/channel-access itself is the caller's job (canSendMessage).
 */
function canAttachDocument(channel, document, { clientAudience } = {}) {
  if (String(document.case) !== String(channel.case)) return false;
  if (['quarantined', 'archived', 'rejected'].includes(document.status)) return false;
  const audience = clientAudience ?? (channel.visibility === 'all_members' || channel.visibility === 'clients_and_team');
  if (audience && document.visibility !== 'client_visible') return false;
  return true;
}

/** True when any client can read the channel — visibility-wide, or via an active client ChannelMember on a restricted one. */
async function channelHasClientAudience(channel) {
  if (channel.visibility === 'all_members' || channel.visibility === 'clients_and_team') return true;
  if (channel.visibility !== 'restricted_members') return false;
  const members = await ChannelMember.find({ channel: channel._id, status: 'active' }).select('workspaceMember').lean();
  if (members.length === 0) return false;
  return !!(await WorkspaceMember.exists({
    _id: { $in: members.map((m) => m.workspaceMember) },
    memberType: 'client',
    status: 'active',
  }));
}

async function canUpdateReadState(req, channel) {
  if (!can(req, 'channels.view')) return false;
  return hasChannelAccess(req, channel);
}

module.exports = {
  hasChannelAccess,
  canViewChannel,
  canCreateChannel,
  canManageChannel,
  canArchiveChannel,
  canManageChannelMembers,
  canSendMessage,
  canReplyToMessage,
  editRule,
  deleteRule,
  canEditMessage,
  canDeleteMessage,
  canModerateMessage,
  canViewMessageRevisions,
  canAttachDocument,
  channelHasClientAudience,
  canUpdateReadState,
  isOwnEmployeeMessage,
};
