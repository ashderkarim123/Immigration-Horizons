const express = require('express');
const mongoose = require('mongoose');

const CaseDocument = require('../../../../models/CaseDocument');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const { parseSingleFileUpload } = require('../../../../middleware/api/documentUpload');
const { CHANNEL_TYPES, CHANNEL_VISIBILITY } = require('../../../../utils/collaborationConstants');
const caseManagement = require('../../../../services/caseManagement');
const collaborationPolicy = require('../../../../services/collaborationPolicy');
const documentPolicy = require('../../../../services/documentPolicy');
const channelService = require('../../../../services/channelService');
const messageService = require('../../../../services/messageService');
const readStateService = require('../../../../services/readStateService');
const chat = require('../../../../services/staffChatService');
const { ensureChatAttachmentsCategory } = require('../../../../services/documentCategoryService');
const { provider, uploadDocument } = require('../../../../services/documentUploadService');
const { extensionOf } = require('../../../../services/documentValidation');

/**
 * Canonical staff chat API (ADR-020 §22) — the same WorkspaceChannel /
 * WorkspaceMessage domain the client portal writes. Handlers are thin:
 * authorize (capability + row policy via staffChatService / collaborationPolicy),
 * call the existing service, map the outcome. Missing and not-yours both 404.
 */

const router = express.Router();

const response = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const asList = (value) => (Array.isArray(value) ? value.map(String) : []);
const actorOf = (req) => ({ type: 'employee', id: req.staff._id, name: req.staff.name || 'Employee' });

/** Wraps a handler so a version conflict from saveGuarded becomes a controlled 409. */
const route = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    if (err && err.isVersionConflict) return next(createApiError(409, 'conflict', err.message));
    return next(err);
  }
};

function failOnOutcome(result) {
  if (result.outcome === 'validation_error') {
    throw createApiError(400, 'validation_error', 'Please correct the highlighted fields.', result.errors);
  }
  if (result.outcome === 'not_found') throw notFound('Resource');
  if (result.outcome === 'conflict') {
    throw createApiError(409, 'conflict', 'This message was updated by someone else. Please reload and try again.');
  }
}

async function mapOne(req, channel, message) {
  const hasAccess = await collaborationPolicy.hasChannelAccess(req, channel);
  return (await chat.mapMessages(req, [message.toObject ? message.toObject() : message], { hasAccess }))[0];
}

/** Channel the actor may view (loadViewableChannel) and, when given, act on via `check` — otherwise the one identical 404. */
function channelParam(check) {
  return route(async (req, res, next) => {
    const channel = await chat.loadViewableChannel(req, req.params.channelId);
    if (!channel || (check && !(await check(req, channel)))) return next(notFound('Channel'));
    req.channel = channel;
    return next();
  });
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

// GET /api/v1/staff/cases/:caseId/channels
router.get('/cases/:caseId/channels', requireApiCapability('channels.view'), route(async (req, res, next) => {
  const result = await chat.loadCaseChannels(req, req.params.caseId);
  if (!result) return next(notFound('Case'));
  return response(res, req, result);
}));

// Shared prelude for case-level channel management: case must exist and the actor must be allowed to create channels.
const caseChannelManager = route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await collaborationPolicy.canCreateChannel(req, loaded.workspace._id))) return next(notFound('Case'));
  req.chatCase = loaded;
  return next();
});

// POST /api/v1/staff/cases/:caseId/channels/initialize — idempotent default-channel provisioning
router.post('/cases/:caseId/channels/initialize', trustedOriginMiddleware, requireApiCapability('channels.create'), caseChannelManager, route(async (req, res) => {
  const { caseDoc, workspace } = req.chatCase;
  const result = await channelService.provisionDefaultChannels({ caseId: caseDoc._id, workspaceId: workspace._id });
  return response(res, req, { created: result.created, skipped: result.skipped });
}));

// POST /api/v1/staff/cases/:caseId/channels
router.post('/cases/:caseId/channels', trustedOriginMiddleware, requireApiCapability('channels.create'), caseChannelManager, route(async (req, res) => {
  const { caseDoc, workspace } = req.chatCase;
  const result = await channelService.createChannel({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    name: req.body.name,
    description: req.body.description,
    channelType: CHANNEL_TYPES.includes(req.body.channelType) ? req.body.channelType : 'standard',
    visibility: req.body.visibility,
    actor: actorOf(req),
  });
  failOnOutcome(result);
  return response(res, req, chat.mapChannel(result.channel, { canSend: true }), 201);
}));

// POST /api/v1/staff/cases/:caseId/channels/reorder
router.post('/cases/:caseId/channels/reorder', trustedOriginMiddleware, requireApiCapability('channels.manage'), caseChannelManager, route(async (req, res) => {
  const result = await channelService.reorderChannels({
    workspaceId: req.chatCase.workspace._id,
    orderedChannelIds: asList(req.body.orderedChannelIds),
    actor: actorOf(req),
  });
  failOnOutcome(result);
  return response(res, req, { outcome: result.outcome });
}));

// GET /api/v1/staff/channels/:channelId
router.get('/channels/:channelId', requireApiCapability('channels.view'), channelParam(), route(async (req, res) => {
  const [canSend, canManage, canManageMembers] = await Promise.all([
    collaborationPolicy.canSendMessage(req, req.channel),
    collaborationPolicy.canManageChannel(req, req.channel),
    collaborationPolicy.canManageChannelMembers(req, req.channel),
  ]);
  return response(res, req, { ...chat.mapChannel(req.channel, { canSend }), canManage, canManageMembers });
}));

// PATCH /api/v1/staff/channels/:channelId
router.patch('/channels/:channelId', trustedOriginMiddleware, requireApiCapability('channels.manage'), channelParam(collaborationPolicy.canManageChannel), route(async (req, res) => {
  const result = await channelService.updateChannel({
    channelId: req.channel._id,
    name: req.body.name,
    description: req.body.description,
    visibility: CHANNEL_VISIBILITY.includes(req.body.visibility) ? req.body.visibility : undefined,
    actor: actorOf(req),
  });
  failOnOutcome(result);
  return response(res, req, chat.mapChannel(result.channel, { canSend: true }));
}));

// POST /api/v1/staff/channels/:channelId/archive
router.post('/channels/:channelId/archive', trustedOriginMiddleware, requireApiCapability('channels.archive'), channelParam(collaborationPolicy.canArchiveChannel), route(async (req, res) => {
  const result = await channelService.archiveChannel({ channelId: req.channel._id, actor: actorOf(req) });
  failOnOutcome(result);
  return response(res, req, { outcome: result.outcome });
}));

// ---------------------------------------------------------------------------
// Channel members (restricted channels) and mention roster
// ---------------------------------------------------------------------------

// GET /api/v1/staff/channels/:channelId/members
router.get('/channels/:channelId/members', requireApiCapability('channels.view'), channelParam(), route(async (req, res) => {
  return response(res, req, { members: await chat.listMembers(req.channel) });
}));

// POST /api/v1/staff/channels/:channelId/members
router.post('/channels/:channelId/members', trustedOriginMiddleware, requireApiCapability('channel_members.manage'), channelParam(collaborationPolicy.canManageChannelMembers), route(async (req, res) => {
  const result = await channelService.addChannelMember({
    channelId: req.channel._id,
    workspaceMemberId: req.body.workspaceMemberId,
    actor: actorOf(req),
  });
  failOnOutcome(result);
  return response(res, req, { members: await chat.listMembers(req.channel) }, 201);
}));

// DELETE /api/v1/staff/channels/:channelId/members/:channelMemberId
router.delete('/channels/:channelId/members/:channelMemberId', trustedOriginMiddleware, requireApiCapability('channel_members.manage'), channelParam(collaborationPolicy.canManageChannelMembers), route(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.channelMemberId)) throw notFound('Member');
  const result = await channelService.removeChannelMember({
    channelId: req.channel._id,
    memberId: req.params.channelMemberId,
    actor: actorOf(req),
  });
  failOnOutcome(result);
  return response(res, req, { members: await chat.listMembers(req.channel) });
}));

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// GET /api/v1/staff/channels/:channelId/messages?before=&limit=
router.get('/channels/:channelId/messages', requireApiCapability('channels.view'), channelParam(), route(async (req, res) => {
  return response(res, req, await chat.listMessages(req, req.channel, { before: req.query.before, limit: req.query.limit }));
}));

// GET /api/v1/staff/channels/:channelId/messages/newer?since=&limit= — incremental sync (new + edited + deleted)
router.get('/channels/:channelId/messages/newer', requireApiCapability('channels.view'), channelParam(), route(async (req, res) => {
  return response(res, req, await chat.listChanges(req, req.channel, { since: req.query.since, limit: req.query.limit }));
}));

// GET /api/v1/staff/channels/:channelId/threads/:messageId
router.get('/channels/:channelId/threads/:messageId', requireApiCapability('channels.view'), channelParam(), route(async (req, res, next) => {
  const thread = await chat.listThread(req, req.channel, req.params.messageId, { before: req.query.before, limit: req.query.limit });
  if (!thread) return next(notFound('Message'));
  return response(res, req, thread);
}));

// Both send routes need an idempotency key: one deliberate send = one key, reused only on retry.
function requireIdempotencyKey(req, res, next) {
  const key = req.body && req.body.idempotencyKey;
  if (typeof key !== 'string' || key.length < 8 || key.length > 100) {
    return next(createApiError(400, 'validation_error', 'An idempotencyKey is required.', { idempotencyKey: 'Required.' }));
  }
  return next();
}

async function sendMessage(req, res, channel, parentMessageId) {
  const actor = actorOf(req);
  const result = await messageService.createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: actor.id,
    senderDisplayName: actor.name,
    body: req.body.body,
    parentMessageId,
    mentionWorkspaceMemberIds: asList(req.body.mentions),
    attachmentDocumentIds: asList(req.body.attachments),
    idempotencyKey: req.body.idempotencyKey,
  });
  failOnOutcome(result);
  return response(res, req, await mapOne(req, channel, result.message), result.idempotent ? 200 : 201);
}

// POST /api/v1/staff/channels/:channelId/messages
router.post('/channels/:channelId/messages', trustedOriginMiddleware, requireApiCapability('messages.send'), channelParam(collaborationPolicy.canSendMessage), requireIdempotencyKey, route(async (req, res) => {
  return sendMessage(req, res, req.channel, null);
}));

// POST /api/v1/staff/messages/:messageId/replies
router.post('/messages/:messageId/replies', trustedOriginMiddleware, requireApiCapability('messages.send'), requireIdempotencyKey, route(async (req, res, next) => {
  const found = await chat.loadViewableMessage(req, req.params.messageId);
  if (!found || !(await collaborationPolicy.canReplyToMessage(req, found.channel))) return next(notFound('Message'));
  return sendMessage(req, res, found.channel, found.message._id);
}));

// PATCH /api/v1/staff/messages/:messageId
router.patch('/messages/:messageId', trustedOriginMiddleware, requireApiCapability('messages.edit_own'), route(async (req, res, next) => {
  const found = await chat.loadViewableMessage(req, req.params.messageId);
  if (!found || !(await collaborationPolicy.canEditMessage(req, found.channel, found.message))) return next(notFound('Message'));
  const result = await messageService.editMessage({
    messageId: found.message._id,
    newBody: req.body.body,
    mentionWorkspaceMemberIds: asList(req.body.mentions),
    actor: actorOf(req),
    expectedUpdatedAt: req.body.expectedUpdatedAt,
  });
  failOnOutcome(result);
  return response(res, req, await mapOne(req, found.channel, result.message));
}));

// POST /api/v1/staff/messages/:messageId/delete — soft delete only; there is no hard-delete endpoint
router.post('/messages/:messageId/delete', trustedOriginMiddleware, requireApiCapability('messages.edit_own'), route(async (req, res, next) => {
  const found = await chat.loadViewableMessage(req, req.params.messageId);
  if (!found || !(await collaborationPolicy.canDeleteMessage(req, found.channel, found.message))) return next(notFound('Message'));
  const result = await messageService.deleteMessage({ messageId: found.message._id, actor: actorOf(req), reason: req.body.reason });
  failOnOutcome(result);
  return response(res, req, await mapOne(req, found.channel, result.message));
}));

// POST /api/v1/staff/messages/:messageId/restore
router.post('/messages/:messageId/restore', trustedOriginMiddleware, requireApiCapability('messages.moderate'), route(async (req, res, next) => {
  const found = await chat.loadViewableMessage(req, req.params.messageId);
  if (!found || !(await collaborationPolicy.canModerateMessage(req, found.channel))) return next(notFound('Message'));
  const result = await messageService.restoreMessage({ messageId: found.message._id, actor: actorOf(req) });
  failOnOutcome(result);
  return response(res, req, await mapOne(req, found.channel, result.message));
}));

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

// POST /api/v1/staff/channels/:channelId/read
router.post('/channels/:channelId/read', trustedOriginMiddleware, requireApiCapability('channels.view'), channelParam(collaborationPolicy.canUpdateReadState), route(async (req, res, next) => {
  const memberId = await chat.currentWorkspaceMemberId(req, req.channel.workspace);
  // An org-wide viewer who is not a workspace member has no read-state row to advance.
  if (!memberId) return response(res, req, { outcome: 'unchanged', unreadCount: 0 });
  const result = await readStateService.markChannelRead({
    channel: req.channel,
    workspaceMemberId: memberId,
    lastReadMessageId: req.body.lastReadMessageId || null,
  });
  failOnOutcome(result);
  const unreadCount = await readStateService.getUnreadCount({ channel: req.channel, workspaceMemberId: memberId, selfAdminId: req.staff._id });
  return response(res, req, { outcome: result.outcome, unreadCount });
}));

// ---------------------------------------------------------------------------
// Attachments — upload goes through the SAME secure document pipeline as the
// Documents tab (ADR-020 §9); the message then references the stored document.
// ---------------------------------------------------------------------------

// GET /api/v1/staff/channels/:channelId/attachable-documents
router.get('/channels/:channelId/attachable-documents', requireApiCapability('documents.view'), channelParam(collaborationPolicy.canSendMessage), route(async (req, res, next) => {
  if (!(await documentPolicy.canViewDocumentCenter(req, req.channel.workspace))) return next(notFound('Channel'));
  return response(res, req, { documents: await chat.listAttachableDocuments(req.channel) });
}));

// POST /api/v1/staff/channels/:channelId/attachments (multipart `file`)
router.post(
  '/channels/:channelId/attachments',
  trustedOriginMiddleware,
  requireApiCapability('messages.send'),
  channelParam(collaborationPolicy.canSendMessage),
  parseSingleFileUpload,
  async (req, res, next) => {
    try {
      const actor = actorOf(req);
      const { channel } = req;
      const clientAudience = await collaborationPolicy.channelHasClientAudience(channel);
      const category = await ensureChatAttachmentsCategory({ caseId: channel.case, workspaceId: channel.workspace });

      const result = await uploadDocument({
        caseId: channel.case,
        workspaceId: channel.workspace,
        categoryId: category._id,
        storageKey: req.documentStorageKey,
        originalName: req.documentOriginalName,
        declaredMimeType: req.documentDeclaredMimeType,
        extension: extensionOf(req.documentOriginalName),
        uploaderType: 'employee',
        uploaderAdminId: actor.id,
        actorName: actor.name,
        // A staff-only channel must never mint a client-visible document.
        visibility: clientAudience ? undefined : 'employees_only',
      });

      let document = result.document;
      let reused = false;
      if (result.outcome === 'duplicate_detected') {
        // A retry of the same upload: reuse the stored document, but only when it is the actor's own and fits this audience.
        const existing = await CaseDocument.findById(result.documentId);
        if (!existing || String(existing.uploadedByAdmin) !== String(actor.id) || !collaborationPolicy.canAttachDocument(channel, existing, { clientAudience })) {
          throw createApiError(409, 'duplicate_document', 'This file has already been uploaded to this case.');
        }
        document = existing;
        reused = true;
      } else if (result.outcome === 'validation_error') {
        throw createApiError(400, 'validation_error', 'The file could not be accepted.', result.errors);
      } else if (result.quarantined) {
        throw createApiError(422, 'file_quarantined', 'The file failed the security scan and was not attached.');
      }

      return response(res, req, {
        reused,
        attachment: {
          documentId: String(document._id),
          displayName: document.displayName,
          mimeType: document.detectedMimeType || document.mimeType,
          extension: document.extension,
          size: document.size,
        },
      }, reused ? 200 : 201);
    } catch (err) {
      if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
      return next(err);
    }
  },
);

module.exports = router;
