const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMessage = require('../../models/WorkspaceMessage');
const ChannelMember = require('../../models/ChannelMember');
const WorkspaceMember = require('../../models/WorkspaceMember');

const { requireCapability } = require('../../utils/permissions');
const { actorFromSession } = require('../../utils/actorSnapshot');
const collaborationPolicy = require('../../services/collaborationPolicy');
const caseManagement = require('../../services/caseManagement');
const channelService = require('../../services/channelService');
const messageService = require('../../services/messageService');
const readStateService = require('../../services/readStateService');
const { encodeCursor, decodeCursor, cursorFilter, boundedLimit } = require('../../utils/messageCursor');
const { CHANNEL_TYPES, CHANNEL_VISIBILITY } = require('../../utils/collaborationConstants');

function handleServiceOutcome(res, req, result, redirectTo) {
  if (result.outcome === 'validation_error') {
    console.warn('[admin/collaboration] validation error:', result.errors);
  }
  return res.redirect(redirectTo);
}

async function currentWorkspaceMemberId(req, workspaceId) {
  const adminUserId = req.session && req.session.adminUser && req.session.adminUser.id;
  if (!adminUserId) return null;
  const member = await WorkspaceMember.findOne({ workspace: workspaceId, adminUser: adminUserId, status: 'active' }).lean();
  return member ? member._id : null;
}

/**
 * Attaches Cycle 6 team-collaboration routes onto the shared admin router
 * — same pattern as documents.js/queries.js/cases.js.
 */
module.exports = function attachCollaboration(router) {
  // ======================================================================
  // COLLABORATION CENTER (channel list)
  // ======================================================================

  router.get('/admin/cases/:caseId/collaboration', requireCapability('channels.view'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.redirect('/admin/cases');
      const { caseDoc, workspace } = loaded;

      const allChannels = await WorkspaceChannel.find({ workspace: workspace._id, archivedAt: null }).sort({ order: 1 }).lean();

      const visible = [];
      for (const channel of allChannels) {
        if (await collaborationPolicy.canViewChannel(req, channel)) visible.push(channel);
      }

      const memberId = await currentWorkspaceMemberId(req, workspace._id);
      const unreadCounts = memberId
        ? await readStateService.getUnreadCountsForChannels({
            channelIds: visible.map((c) => c._id),
            workspaceMemberId: memberId,
            selfAdminId: req.session.adminUser.id,
          })
        : {};

      const canCreateChannel = await collaborationPolicy.canCreateChannel(req, workspace._id);

      res.render('admin/collaboration/index', {
        title: `Collaboration: ${caseDoc.caseNumber} | Admin`,
        caseDoc,
        workspace,
        channels: visible,
        unreadCounts,
        canCreateChannel,
        channelTypes: CHANNEL_TYPES,
        channelVisibility: CHANNEL_VISIBILITY,
        currentPage: 'cases',
      });
    } catch (err) {
      console.error('[admin/collaboration/index]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}`);
    }
  });

  // ======================================================================
  // CHANNEL VIEW
  // ======================================================================

  router.get('/admin/channels/:channelId', requireCapability('channels.view'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canViewChannel(req, channel))) {
        return res.status(403).send('Forbidden.');
      }

      const cursor = decodeCursor(req.query.before);
      const limit = boundedLimit(req.query.limit);
      const filter = { channel: channel._id, parentMessage: null, ...cursorFilter(cursor) };
      const messages = await WorkspaceMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();

      const nextCursor =
        messages.length === limit ? encodeCursor({ createdAt: messages[messages.length - 1].createdAt, id: messages[messages.length - 1]._id }) : null;

      const memberId = await currentWorkspaceMemberId(req, channel.workspace);
      if (memberId) {
        await readStateService.markChannelRead({ channel, workspaceMemberId: memberId, lastReadMessageId: messages[0] ? messages[0]._id : null });
      }

      const canSend = await collaborationPolicy.canSendMessage(req, channel);
      const canModerate = await collaborationPolicy.canModerateMessage(req, channel);
      const canManageMembers = await collaborationPolicy.canManageChannelMembers(req, channel);

      let restrictedMembers = [];
      if (channel.visibility === 'restricted_members') {
        restrictedMembers = await ChannelMember.find({ channel: channel._id, status: 'active' })
          .populate({ path: 'workspaceMember', populate: [{ path: 'clientUser', select: 'email firstName' }, { path: 'adminUser', select: 'name' }] })
          .lean();
      }
      const workspaceMembers = canManageMembers
        ? await WorkspaceMember.find({ workspace: channel.workspace, status: 'active' })
            .populate('clientUser', 'email firstName')
            .populate('adminUser', 'name')
            .lean()
        : [];

      res.render('admin/collaboration/channel', {
        title: `${channel.name} | Admin`,
        channel,
        messages: messages.map(messageService.serializeMessage).reverse(),
        nextCursor,
        canSend,
        canModerate,
        canManageMembers,
        restrictedMembers,
        workspaceMembers,
        currentPage: 'cases',
      });
    } catch (err) {
      console.error('[admin/collaboration/channel]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // THREAD VIEW
  // ======================================================================

  router.get('/admin/channels/:channelId/thread/:messageId', requireCapability('channels.view'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canViewChannel(req, channel))) {
        return res.status(403).send('Forbidden.');
      }
      const rootMessage = await WorkspaceMessage.findOne({ _id: req.params.messageId, channel: channel._id }).lean();
      if (!rootMessage) return res.status(404).send('Message not found.');

      const cursor = decodeCursor(req.query.before);
      const limit = boundedLimit(req.query.limit);
      const filter = { threadRoot: rootMessage._id, ...cursorFilter(cursor) };
      const replies = await WorkspaceMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();

      const canSend = await collaborationPolicy.canReplyToMessage(req, channel);

      res.render('admin/collaboration/thread', {
        title: `Thread | Admin`,
        channel,
        rootMessage: messageService.serializeMessage(rootMessage),
        replies: replies.map(messageService.serializeMessage).reverse(),
        canSend,
        currentPage: 'cases',
      });
    } catch (err) {
      console.error('[admin/collaboration/thread]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // CHANNEL BACKFILL (existing cases — module doc §11)
  // ======================================================================

  router.post('/admin/cases/:caseId/initialize-channels', requireCapability('channels.create'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await collaborationPolicy.canCreateChannel(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      await channelService.provisionDefaultChannels({ caseId: caseDoc._id, workspaceId: workspace._id });
      res.redirect(`/admin/cases/${caseDoc._id}/collaboration`);
    } catch (err) {
      console.error('[admin/collaboration/initialize-channels]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}/collaboration`);
    }
  });

  // ======================================================================
  // CHANNEL MANAGEMENT
  // ======================================================================

  router.post('/admin/cases/:caseId/channels', requireCapability('channels.create'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await collaborationPolicy.canCreateChannel(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const result = await channelService.createChannel({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        name: req.body.name,
        description: req.body.description,
        channelType: req.body.channelType,
        visibility: req.body.visibility,
        actor,
      });
      handleServiceOutcome(res, req, result, `/admin/cases/${caseDoc._id}/collaboration`);
    } catch (err) {
      console.error('[admin/collaboration/channels/create]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}/collaboration`);
    }
  });

  router.post('/admin/channels/:channelId/update', requireCapability('channels.manage'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canManageChannel(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      const result = await channelService.updateChannel({
        channelId: req.params.channelId,
        name: req.body.name,
        description: req.body.description,
        visibility: req.body.visibility,
        actor,
      });
      handleServiceOutcome(res, req, result, `/admin/cases/${channel.case}/collaboration`);
    } catch (err) {
      console.error('[admin/collaboration/channels/update]', err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/cases/:caseId/channels/reorder', requireCapability('channels.manage'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await collaborationPolicy.canCreateChannel(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const orderedChannelIds = Array.isArray(req.body.orderedChannelIds)
        ? req.body.orderedChannelIds
        : [req.body.orderedChannelIds].filter(Boolean);

      const result = await channelService.reorderChannels({ workspaceId: workspace._id, orderedChannelIds, actor });
      handleServiceOutcome(res, req, result, `/admin/cases/${caseDoc._id}/collaboration`);
    } catch (err) {
      console.error('[admin/collaboration/channels/reorder]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}/collaboration`);
    }
  });

  router.post('/admin/channels/:channelId/archive', requireCapability('channels.archive'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canArchiveChannel(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      await channelService.archiveChannel({ channelId: req.params.channelId, actor });
      res.redirect(`/admin/cases/${channel.case}/collaboration`);
    } catch (err) {
      console.error('[admin/collaboration/channels/archive]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // RESTRICTED-CHANNEL MEMBERSHIP
  // ======================================================================

  router.post('/admin/channels/:channelId/members', requireCapability('channel_members.manage'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canManageChannelMembers(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      const result = await channelService.addChannelMember({
        channelId: req.params.channelId,
        workspaceMemberId: req.body.workspaceMemberId,
        actor,
      });
      handleServiceOutcome(res, req, result, `/admin/channels/${req.params.channelId}`);
    } catch (err) {
      console.error('[admin/collaboration/members/add]', err.message);
      res.redirect(`/admin/channels/${req.params.channelId}`);
    }
  });

  router.post('/admin/channels/:channelId/members/:memberId/remove', requireCapability('channel_members.manage'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canManageChannelMembers(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      await channelService.removeChannelMember({ channelId: req.params.channelId, memberId: req.params.memberId, actor });
      res.redirect(`/admin/channels/${req.params.channelId}`);
    } catch (err) {
      console.error('[admin/collaboration/members/remove]', err.message);
      res.redirect(`/admin/channels/${req.params.channelId}`);
    }
  });

  // ======================================================================
  // MESSAGES
  // ======================================================================

  router.post('/admin/channels/:channelId/messages', requireCapability('messages.send'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId);
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canSendMessage(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      const mentionIds = Array.isArray(req.body.mentions) ? req.body.mentions : [req.body.mentions].filter(Boolean);
      const attachmentIds = Array.isArray(req.body.attachments) ? req.body.attachments : [req.body.attachments].filter(Boolean);

      const result = await messageService.createMessage({
        channel,
        senderType: 'employee',
        senderAdminId: actor.id,
        senderDisplayName: actor.name,
        body: req.body.body,
        mentionWorkspaceMemberIds: mentionIds,
        attachmentDocumentIds: attachmentIds,
        idempotencyKey: req.body.idempotencyKey,
      });
      handleServiceOutcome(res, req, result, `/admin/channels/${req.params.channelId}`);
    } catch (err) {
      console.error('[admin/collaboration/messages/create]', err.message);
      res.redirect(`/admin/channels/${req.params.channelId}`);
    }
  });

  router.post('/admin/messages/:messageId/replies', requireCapability('messages.send'), async (req, res) => {
    try {
      const parent = await WorkspaceMessage.findById(req.params.messageId).lean();
      if (!parent) return res.status(404).send('Message not found.');
      const channel = await WorkspaceChannel.findById(parent.channel);
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canReplyToMessage(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      const mentionIds = Array.isArray(req.body.mentions) ? req.body.mentions : [req.body.mentions].filter(Boolean);

      const result = await messageService.createMessage({
        channel,
        senderType: 'employee',
        senderAdminId: actor.id,
        senderDisplayName: actor.name,
        body: req.body.body,
        parentMessageId: parent._id,
        mentionWorkspaceMemberIds: mentionIds,
        idempotencyKey: req.body.idempotencyKey,
      });
      const rootId = parent.threadRoot || parent._id;
      handleServiceOutcome(res, req, result, `/admin/channels/${channel._id}/thread/${rootId}`);
    } catch (err) {
      console.error('[admin/collaboration/replies/create]', err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/messages/:messageId/edit', requireCapability('messages.edit_own'), async (req, res) => {
    try {
      const message = await WorkspaceMessage.findById(req.params.messageId).lean();
      if (!message) return res.status(404).send('Message not found.');
      const channel = await WorkspaceChannel.findById(message.channel).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canEditMessage(req, channel, message))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      const mentionIds = Array.isArray(req.body.mentions) ? req.body.mentions : [req.body.mentions].filter(Boolean);
      const result = await messageService.editMessage({
        messageId: req.params.messageId,
        newBody: req.body.body,
        mentionWorkspaceMemberIds: mentionIds,
        actor,
      });
      if (result.isVersionConflict) console.warn('[admin/collaboration/messages/edit] version conflict');
      const backTo = message.threadRoot ? `/admin/channels/${channel._id}/thread/${message.threadRoot}` : `/admin/channels/${channel._id}`;
      res.redirect(backTo);
    } catch (err) {
      console.error('[admin/collaboration/messages/edit]', err.isVersionConflict ? 'version conflict' : err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/messages/:messageId/delete', requireCapability('messages.edit_own'), async (req, res) => {
    try {
      const message = await WorkspaceMessage.findById(req.params.messageId).lean();
      if (!message) return res.status(404).send('Message not found.');
      const channel = await WorkspaceChannel.findById(message.channel).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canDeleteMessage(req, channel, message))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      await messageService.deleteMessage({ messageId: req.params.messageId, actor, reason: req.body.reason });
      const backTo = message.threadRoot ? `/admin/channels/${channel._id}/thread/${message.threadRoot}` : `/admin/channels/${channel._id}`;
      res.redirect(backTo);
    } catch (err) {
      console.error('[admin/collaboration/messages/delete]', err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/messages/:messageId/restore', requireCapability('messages.moderate'), async (req, res) => {
    try {
      const message = await WorkspaceMessage.findById(req.params.messageId).lean();
      if (!message) return res.status(404).send('Message not found.');
      const channel = await WorkspaceChannel.findById(message.channel).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canModerateMessage(req, channel))) return res.status(403).send('Forbidden.');

      const actor = actorFromSession(req);
      await messageService.restoreMessage({ messageId: req.params.messageId, actor });
      const backTo = message.threadRoot ? `/admin/channels/${channel._id}/thread/${message.threadRoot}` : `/admin/channels/${channel._id}`;
      res.redirect(backTo);
    } catch (err) {
      console.error('[admin/collaboration/messages/restore]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // READ STATE
  // ======================================================================

  router.post('/admin/channels/:channelId/read', requireCapability('channels.view'), async (req, res) => {
    try {
      const channel = await WorkspaceChannel.findById(req.params.channelId).lean();
      if (!channel) return res.status(404).send('Channel not found.');
      if (!(await collaborationPolicy.canUpdateReadState(req, channel))) return res.status(403).send('Forbidden.');

      const memberId = await currentWorkspaceMemberId(req, channel.workspace);
      if (!memberId) return res.status(403).send('Forbidden.');

      await readStateService.markChannelRead({ channel, workspaceMemberId: memberId, lastReadMessageId: req.body.lastReadMessageId || null });
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/collaboration/read]', err.message);
      res.status(500).json({ ok: false });
    }
  });
};
