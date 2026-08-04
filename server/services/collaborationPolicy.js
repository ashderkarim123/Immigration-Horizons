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
  const adminUserId = req.session && req.session.adminUser && req.session.adminUser.id;
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
  const adminUserId = req.session && req.session.adminUser && req.session.adminUser.id;
  return message.senderType === 'employee' && !!adminUserId && String(message.senderAdmin) === String(adminUserId);
}

async function canEditMessage(req, channel, message) {
  if (message.deletedAt) return false;
  if (isOwnEmployeeMessage(req, message)) {
    if (!can(req, 'messages.edit_own')) return false;
    if (Date.now() - new Date(message.createdAt).getTime() > MESSAGE_EDIT_WINDOW_MS) return false;
    return hasChannelAccess(req, channel);
  }
  if (!can(req, 'messages.moderate')) return false;
  return hasChannelAccess(req, channel);
}

async function canDeleteMessage(req, channel, message) {
  if (message.deletedAt) return false;
  if (isOwnEmployeeMessage(req, message)) {
    if (!can(req, 'messages.edit_own')) return false;
    return hasChannelAccess(req, channel);
  }
  if (!can(req, 'messages.moderate')) return false;
  return hasChannelAccess(req, channel);
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
 * Document must belong to the same case as the channel, must not be
 * quarantined, and a client-accessible channel may only attach a
 * client-visible document (module doc §16 attachment rules 2-4).
 * Capability/channel-access itself is the caller's job (canSendMessage).
 */
function canAttachDocument(channel, document) {
  if (String(document.case) !== String(channel.case)) return false;
  if (document.status === 'quarantined') return false;
  const channelIsClientAccessible = channel.visibility === 'all_members' || channel.visibility === 'clients_and_team';
  if (channelIsClientAccessible && document.visibility !== 'client_visible') return false;
  return true;
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
  canEditMessage,
  canDeleteMessage,
  canModerateMessage,
  canViewMessageRevisions,
  canAttachDocument,
  canUpdateReadState,
  isOwnEmployeeMessage,
};
