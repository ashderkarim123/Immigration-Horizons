const mongoose = require('mongoose');

const WorkspaceChannel = require('../models/WorkspaceChannel');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const WorkspaceMember = require('../models/WorkspaceMember');
const ChannelMember = require('../models/ChannelMember');
const CaseDocument = require('../models/CaseDocument');

const { can } = require('../utils/permissions');
const { encodeCursor, decodeCursor, cursorFilter, changedFilter, boundedLimit } = require('../utils/messageCursor');
const { hasActiveEmployeeMembership } = require('./casePolicy');
const caseManagement = require('./caseManagement');
const collaborationPolicy = require('./collaborationPolicy');
const readStateService = require('./readStateService');

/**
 * Read/shape side of the staff chat API (ADR-020 §22/§24). Every loader
 * returns null for "missing OR not yours" so a route can answer one
 * identical 404 — a guessed channel/message id is never an existence oracle.
 * Writes stay in channelService / messageService; this file never mutates.
 */

const id = (value) => (value ? String(value._id || value) : null);

/** What the UI badges a channel with — never derived from colour alone on the client. */
function audienceOf(channel) {
  if (channel.visibility === 'employees_only') return 'staff_only';
  if (channel.visibility === 'restricted_members') return 'restricted';
  return 'client_and_team';
}

async function currentWorkspaceMemberId(req, workspaceId) {
  const member = await WorkspaceMember.findOne({
    workspace: workspaceId,
    adminUser: req.staff._id,
    memberType: 'employee',
    status: 'active',
  })
    .select('_id')
    .lean();
  return member ? member._id : null;
}

/** Loads a channel the actor may view, or null. Archived channels are treated as gone, as the portal does. */
async function loadViewableChannel(req, channelId) {
  if (!mongoose.Types.ObjectId.isValid(channelId)) return null;
  const channel = await WorkspaceChannel.findById(channelId);
  if (!channel || channel.archivedAt) return null;
  if (!(await collaborationPolicy.canViewChannel(req, channel))) return null;
  return channel;
}

/** Loads a message plus its viewable channel, or null. */
async function loadViewableMessage(req, messageId) {
  if (!mongoose.Types.ObjectId.isValid(messageId)) return null;
  const message = await WorkspaceMessage.findById(messageId).lean();
  if (!message) return null;
  const channel = await loadViewableChannel(req, message.channel);
  return channel ? { message, channel } : null;
}

function mapChannel(channel, { unreadCount = 0, canSend = false } = {}) {
  return {
    id: id(channel),
    name: channel.name,
    slug: channel.slug,
    description: channel.description || '',
    channelType: channel.channelType,
    visibility: channel.visibility,
    audience: audienceOf(channel),
    clientVisible: audienceOf(channel) === 'client_and_team',
    order: channel.order,
    unreadCount,
    canSend,
    createdAt: channel.createdAt,
  };
}

async function loadCaseChannels(req, caseId) {
  const loaded = await caseManagement.loadCaseAndWorkspace(caseId);
  if (!loaded) return null;
  const { caseDoc, workspace } = loaded;

  const orgWide = can(req, 'channels.view_all');
  if (!can(req, 'channels.view')) return null;
  if (!orgWide && !(await hasActiveEmployeeMembership(req, workspace._id))) return null;

  const all = await WorkspaceChannel.find({ workspace: workspace._id, archivedAt: null }).sort({ order: 1 }).lean();
  const visible = [];
  for (const channel of all) {
    if (await collaborationPolicy.canViewChannel(req, channel)) visible.push(channel);
  }

  const memberId = await currentWorkspaceMemberId(req, workspace._id);
  const unread = memberId
    ? await readStateService.getUnreadCountsForChannels({
        channelIds: visible.map((c) => c._id),
        workspaceMemberId: memberId,
        selfAdminId: req.staff._id,
      })
    : {};

  const channels = [];
  for (const channel of visible) {
    channels.push(
      mapChannel(channel, {
        unreadCount: unread[String(channel._id)] || 0,
        canSend: await collaborationPolicy.canSendMessage(req, channel),
      }),
    );
  }

  return {
    case: { id: id(caseDoc), caseNumber: caseDoc.caseNumber, title: caseDoc.title },
    workspaceId: id(workspace),
    channels,
    capabilities: {
      canCreateChannel: await collaborationPolicy.canCreateChannel(req, workspace._id),
    },
  };
}

/** Safe attachment metadata only — id, display name, type, size. Never storage keys or paths. */
async function loadAttachmentMetadata(messages) {
  const documentIds = [...new Set(messages.flatMap((m) => m.attachments.map((a) => String(a.document))))];
  if (documentIds.length === 0) return new Map();
  const documents = await CaseDocument.find({ _id: { $in: documentIds } })
    .select('detectedMimeType mimeType extension size status')
    .lean();
  return new Map(documents.map((d) => [String(d._id), d]));
}

/**
 * Shapes messages for Angular. Channel access is resolved once by the caller
 * (`hasAccess`); the per-message edit/delete/restore flags then reuse the
 * policy's synchronous rules instead of re-querying per row.
 */
async function mapMessages(req, messages, { hasAccess }) {
  const attachmentMeta = await loadAttachmentMetadata(messages);
  return messages.map((message) => {
    const deleted = !!message.deletedAt;
    const canModerate = hasAccess && can(req, 'messages.moderate');
    return {
      id: id(message),
      channelId: id(message.channel),
      senderType: message.senderType,
      senderDisplayName: message.senderDisplayName,
      isOwn: collaborationPolicy.isOwnEmployeeMessage(req, message),
      body: deleted ? '[This message was deleted.]' : message.body,
      messageType: message.messageType,
      parentMessageId: id(message.parentMessage),
      threadRootId: id(message.threadRoot),
      replyCount: message.replyCount,
      lastReplyAt: message.lastReplyAt || null,
      mentions: deleted ? [] : message.mentions.map((m) => ({ workspaceMemberId: id(m.workspaceMember), displayName: m.displayNameSnapshot })),
      attachments: deleted
        ? []
        : message.attachments.map((a) => {
            const meta = attachmentMeta.get(String(a.document));
            return {
              documentId: id(a.document),
              versionId: id(a.documentVersion),
              displayName: a.displayNameSnapshot,
              mimeType: meta ? meta.detectedMimeType || meta.mimeType : null,
              extension: meta ? meta.extension : null,
              size: meta ? meta.size : null,
              downloadable: !!meta && meta.status !== 'quarantined',
            };
          }),
      editedAt: message.editedAt || null,
      deletedAt: message.deletedAt || null,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      canEdit: hasAccess && collaborationPolicy.editRule(req, message),
      canDelete: hasAccess && collaborationPolicy.deleteRule(req, message),
      canRestore: canModerate && deleted,
    };
  });
}

/** Cursor naming: `before` pages back through history, `since` is the incremental-sync cursor. */
const syncCursorOf = (message) => encodeCursor({ createdAt: message.updatedAt, id: message._id });

/** Newest page of root messages, oldest-first, plus the cursors a client needs to keep paging and polling. */
async function listMessages(req, channel, { before, limit }) {
  const pageSize = boundedLimit(limit);
  const filter = { channel: channel._id, parentMessage: null, ...cursorFilter(decodeCursor(before)) };
  const rows = await WorkspaceMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize).lean();
  const newest = await WorkspaceMessage.findOne({ channel: channel._id }).sort({ updatedAt: -1, _id: -1 }).select('updatedAt').lean();
  const hasAccess = await collaborationPolicy.hasChannelAccess(req, channel);
  return {
    messages: await mapMessages(req, rows.slice().reverse(), { hasAccess }),
    nextCursor: rows.length === pageSize ? encodeCursor({ createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1]._id }) : null,
    syncCursor: newest ? syncCursorOf(newest) : null,
  };
}

/** Everything created OR changed (edit, delete, reply-count) after `since`, roots and replies alike. */
async function listChanges(req, channel, { since, limit }) {
  const cursor = decodeCursor(since);
  const pageSize = boundedLimit(limit);
  const rows = await WorkspaceMessage.find({ channel: channel._id, ...changedFilter(cursor) })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(pageSize)
    .lean();
  const hasAccess = await collaborationPolicy.hasChannelAccess(req, channel);
  const last = rows[rows.length - 1];
  return {
    messages: await mapMessages(req, rows, { hasAccess }),
    syncCursor: last ? syncCursorOf(last) : since || null,
    hasMore: rows.length === pageSize,
  };
}

async function listThread(req, channel, rootId, { before, limit }) {
  if (!mongoose.Types.ObjectId.isValid(rootId)) return null;
  const root = await WorkspaceMessage.findOne({ _id: rootId, channel: channel._id, parentMessage: null }).lean();
  if (!root) return null;
  const pageSize = boundedLimit(limit);
  const replies = await WorkspaceMessage.find({ threadRoot: root._id, ...cursorFilter(decodeCursor(before)) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageSize)
    .lean();
  const hasAccess = await collaborationPolicy.hasChannelAccess(req, channel);
  const [mappedRoot] = await mapMessages(req, [root], { hasAccess });
  return {
    root: mappedRoot,
    replies: await mapMessages(req, replies.slice().reverse(), { hasAccess }),
    nextCursor: replies.length === pageSize ? encodeCursor({ createdAt: replies[replies.length - 1].createdAt, id: replies[replies.length - 1]._id }) : null,
  };
}

async function listMembers(channel) {
  const members = await WorkspaceMember.find({ workspace: channel.workspace, status: 'active' })
    .populate('clientUser', 'firstName lastName email')
    .populate('adminUser', 'name')
    .lean();
  const channelMembers =
    channel.visibility === 'restricted_members' ? await ChannelMember.find({ channel: channel._id, status: 'active' }).lean() : [];
  const channelMemberByWorkspaceMember = new Map(channelMembers.map((m) => [String(m.workspaceMember), String(m._id)]));
  // Clients never appear in an employees_only channel's roster — they cannot be mentioned or added there.
  return members
    .filter((m) => !(channel.visibility === 'employees_only' && m.memberType === 'client'))
    .map((m) => ({
      workspaceMemberId: id(m),
      memberType: m.memberType,
      displayName:
        m.memberType === 'client'
          ? [m.clientUser?.firstName, m.clientUser?.lastName].filter(Boolean).join(' ') || m.clientUser?.email || 'Client'
          : m.adminUser?.name || 'Team Member',
      channelMemberId: channelMemberByWorkspaceMember.get(String(m._id)) || null,
    }));
}

/** Documents the actor could attach right now — server-filtered with the same rule createMessage enforces. */
async function listAttachableDocuments(channel) {
  const clientAudience = await collaborationPolicy.channelHasClientAudience(channel);
  const documents = await CaseDocument.find({
    case: channel.case,
    status: { $nin: ['quarantined', 'archived', 'rejected'] },
    currentVersion: { $ne: null },
    ...(clientAudience ? { visibility: 'client_visible' } : {}),
  })
    .select('displayName detectedMimeType mimeType extension size')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return documents.map((d) => ({
    documentId: id(d),
    displayName: d.displayName,
    mimeType: d.detectedMimeType || d.mimeType,
    extension: d.extension,
    size: d.size,
  }));
}

module.exports = {
  audienceOf,
  currentWorkspaceMemberId,
  loadViewableChannel,
  loadViewableMessage,
  loadCaseChannels,
  mapChannel,
  mapMessages,
  listMessages,
  listChanges,
  listThread,
  listMembers,
  listAttachableDocuments,
};
