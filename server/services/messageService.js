const mongoose = require('mongoose');

const WorkspaceMessage = require('../models/WorkspaceMessage');
const WorkspaceChannel = require('../models/WorkspaceChannel');
const MessageRevision = require('../models/MessageRevision');
const WorkspaceMember = require('../models/WorkspaceMember');
const ChannelMember = require('../models/ChannelMember');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const CaseDocument = require('../models/CaseDocument');
const ClientCase = require('../models/ClientCase');

const { canAttachDocument } = require('./collaborationPolicy');
const { notify } = require('../utils/notify');
const { sendMentionEmail } = require('./collaborationEmail');
const { MAX_MENTIONS_PER_MESSAGE, MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_BODY_LENGTH } = require('../utils/collaborationConstants');

function isVersionConflict(err) {
  return err instanceof mongoose.Error.VersionError;
}

/** Mirrors documentUploadService.js's saveGuarded (ADR-005 §14). */
async function saveGuarded(doc) {
  try {
    await doc.save();
  } catch (err) {
    if (isVersionConflict(err)) {
      const conflictError = new Error('This message was updated by someone else. Please reload and try again.');
      conflictError.isVersionConflict = true;
      throw conflictError;
    }
    throw err;
  }
}

/** Trims, caps length, and normalizes line endings — never accepts raw HTML (there is no formatting layer to sanitize; plain text only, ADR-005 §7). */
function normalizeBody(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, MAX_MESSAGE_BODY_LENGTH);
}

async function nextRevisionNumber(messageId) {
  const last = await MessageRevision.findOne({ message: messageId }).sort({ revisionNumber: -1 }).select('revisionNumber').lean();
  return (last ? last.revisionNumber : 0) + 1;
}

/**
 * Resolves and re-validates an explicit list of mentioned workspaceMember
 * ids — never parsed from message text (ADR-005 §10). Every id must be an
 * active workspace member; for a restricted channel, also an active
 * ChannelMember. The client's selection is a request, never an
 * authorization.
 */
async function resolveMentions({ workspaceId, workspaceMemberIds, channel }) {
  if (!workspaceMemberIds || workspaceMemberIds.length === 0) return { outcome: 'ok', value: [] };
  if (workspaceMemberIds.length > MAX_MENTIONS_PER_MESSAGE) {
    return { outcome: 'validation_error', errors: { mentions: 'Too many mentions.' } };
  }

  const uniqueIds = [...new Set(workspaceMemberIds.map(String))];
  const members = await WorkspaceMember.find({ _id: { $in: uniqueIds }, workspace: workspaceId, status: 'active' }).lean();
  if (members.length !== uniqueIds.length) {
    return { outcome: 'validation_error', errors: { mentions: 'One or more mentioned members are not active workspace members.' } };
  }

  if (channel.visibility === 'restricted_members') {
    const channelMembers = await ChannelMember.find({
      channel: channel._id,
      workspaceMember: { $in: uniqueIds },
      status: 'active',
    }).lean();
    if (channelMembers.length !== uniqueIds.length) {
      return { outcome: 'validation_error', errors: { mentions: 'One or more mentioned members do not have access to this channel.' } };
    }
  }

  const value = [];
  for (const member of members) {
    let displayName = 'Team Member';
    if (member.memberType === 'client') {
      const clientUser = await ClientUser.findById(member.clientUser).select('firstName email').lean();
      displayName = clientUser ? clientUser.firstName || clientUser.email : 'Client';
    } else {
      const adminUser = await AdminUser.findById(member.adminUser).select('name').lean();
      displayName = adminUser ? adminUser.name : 'Team Member';
    }
    value.push({
      memberType: member.memberType,
      clientUser: member.memberType === 'client' ? member.clientUser : null,
      adminUser: member.memberType === 'employee' ? member.adminUser : null,
      workspaceMember: member._id,
      displayNameSnapshot: displayName,
    });
  }
  return { outcome: 'ok', value };
}

/** Snapshots each document's CURRENT version at attach time (ADR-005 §11) — never re-resolved later. */
async function resolveAttachments({ channel, documentIds }) {
  if (!documentIds || documentIds.length === 0) return { outcome: 'ok', value: [] };
  if (documentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { outcome: 'validation_error', errors: { attachments: 'Too many attachments.' } };
  }

  const uniqueIds = [...new Set(documentIds.map(String))];
  const documents = await CaseDocument.find({ _id: { $in: uniqueIds } });
  if (documents.length !== uniqueIds.length) {
    return { outcome: 'validation_error', errors: { attachments: 'One or more documents were not found.' } };
  }

  const value = [];
  for (const document of documents) {
    if (!canAttachDocument(channel, document)) {
      return { outcome: 'validation_error', errors: { attachments: `"${document.displayName}" cannot be attached to this channel.` } };
    }
    if (!document.currentVersion) {
      return { outcome: 'validation_error', errors: { attachments: `"${document.displayName}" has no current version.` } };
    }
    value.push({ document: document._id, documentVersion: document.currentVersion, displayNameSnapshot: document.displayName });
  }
  return { outcome: 'ok', value };
}

function excerpt(body) {
  const trimmed = (body || '').trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

/** In-app for a mentioned employee; email for a mentioned client (module doc §27 — mentions only, never a routine-message email). */
async function notifyMentionedMember(mention, { channel, senderDisplayName, messageExcerpt }) {
  try {
    if (mention.memberType === 'employee') {
      const adminUser = await AdminUser.findById(mention.adminUser).select('name').lean();
      if (!adminUser) return;
      await notify({
        recipientName: adminUser.name,
        title: `${senderDisplayName} mentioned you`,
        message: `In "${channel.name}": ${messageExcerpt}`,
        type: 'message_mention',
        relatedCase: channel.case,
        relatedChannel: channel._id,
      });
    } else {
      const clientUser = await ClientUser.findById(mention.clientUser).select('email firstName').lean();
      if (!clientUser) return;
      const caseDoc = await ClientCase.findById(channel.case).select('caseNumber').lean();
      if (!caseDoc) return;
      await sendMentionEmail({
        to: clientUser.email,
        firstName: clientUser.firstName,
        caseNumber: caseDoc.caseNumber,
        channelName: channel.name,
        senderDisplayName,
        messageExcerpt,
        caseId: channel.case,
      });
    }
  } catch (err) {
    console.error('[collaboration] mention notification failed:', err.message);
  }
}

/**
 * Notifies the parent message's author about a reply — employees only,
 * in-app (module doc's conservative email policy reserves email for
 * direct mentions specifically, not the more routine "someone replied").
 * Never notifies the replier about their own reply.
 */
async function notifyReplyToAuthor(parentMessage, { channel, senderDisplayName, messageExcerpt, replierType, replierAdminId }) {
  try {
    if (parentMessage.senderType !== 'employee') return;
    if (replierType === 'employee' && String(parentMessage.senderAdmin) === String(replierAdminId)) return;
    const adminUser = await AdminUser.findById(parentMessage.senderAdmin).select('name').lean();
    if (!adminUser) return;
    await notify({
      recipientName: adminUser.name,
      title: `${senderDisplayName} replied to your message`,
      message: `In "${channel.name}": ${messageExcerpt}`,
      type: 'message_reply',
      relatedCase: channel.case,
      relatedChannel: channel._id,
    });
  } catch (err) {
    console.error('[collaboration] reply notification failed:', err.message);
  }
}

/**
 * Creates a top-level message or a reply. A reply targeting another reply
 * is normalized to that reply's own threadRoot (ADR-005 §9) — never more
 * than one level deep. Idempotent on `idempotencyKey` (ADR-005 §19): a
 * repeated request with the same key returns the original message.
 */
async function createMessage({
  channel,
  senderType,
  senderClientId,
  senderAdminId,
  senderDisplayName,
  body,
  messageType,
  parentMessageId,
  mentionWorkspaceMemberIds,
  attachmentDocumentIds,
  idempotencyKey,
  clientVisible,
}) {
  if (idempotencyKey) {
    const existing = await WorkspaceMessage.findOne({ channel: channel._id, idempotencyKey });
    if (existing) return { outcome: 'created', message: existing, idempotent: true };
  }

  let parentMessage = null;
  let threadRoot = null;
  let replyTarget = null; // the message the user actually clicked "reply" on — used for reply notification only, not storage (ADR-005 §9)
  if (parentMessageId) {
    const parent = await WorkspaceMessage.findById(parentMessageId);
    if (!parent || String(parent.channel) !== String(channel._id)) {
      return { outcome: 'validation_error', errors: { parentMessage: 'Parent message not found in this channel.' } };
    }
    replyTarget = parent;
    threadRoot = parent.threadRoot || parent._id;
    parentMessage = threadRoot;
  }

  const mentionsResult = await resolveMentions({
    workspaceId: channel.workspace,
    workspaceMemberIds: mentionWorkspaceMemberIds || [],
    channel,
  });
  if (mentionsResult.outcome === 'validation_error') return mentionsResult;

  const attachmentsResult = await resolveAttachments({ channel, documentIds: attachmentDocumentIds || [] });
  if (attachmentsResult.outcome === 'validation_error') return attachmentsResult;

  const normalizedBody = normalizeBody(body);

  let message;
  try {
    message = await WorkspaceMessage.create({
      workspace: channel.workspace,
      case: channel.case,
      channel: channel._id,
      senderType,
      senderClient: senderType === 'client' ? senderClientId : null,
      senderAdmin: senderType === 'employee' ? senderAdminId : null,
      senderDisplayName,
      body: normalizedBody,
      messageType: messageType || 'text',
      parentMessage,
      threadRoot,
      mentions: mentionsResult.value,
      attachments: attachmentsResult.value,
      clientVisible: typeof clientVisible === 'boolean' ? clientVisible : true,
      idempotencyKey: idempotencyKey || null,
    });
  } catch (err) {
    if (err && err.code === 11000 && idempotencyKey) {
      const existing = await WorkspaceMessage.findOne({ channel: channel._id, idempotencyKey });
      if (existing) return { outcome: 'created', message: existing, idempotent: true };
    }
    throw err;
  }

  if (parentMessage) {
    await WorkspaceMessage.updateOne(
      { _id: threadRoot },
      { $inc: { replyCount: 1 }, $set: { lastReplyAt: message.createdAt } },
    );
  }

  // Best-effort notifications — never block/roll back a successfully
  // created, already-durable message (ADR-005 §17/§22). This point is
  // only reached for a genuinely new message — every idempotent-repeat
  // path above already returned before here.
  const messageExcerpt = excerpt(normalizedBody);
  const mentionedSelf = (m) =>
    (senderType === 'client' && m.memberType === 'client' && String(m.clientUser) === String(senderClientId)) ||
    (senderType === 'employee' && m.memberType === 'employee' && String(m.adminUser) === String(senderAdminId));
  for (const mention of mentionsResult.value) {
    if (mentionedSelf(mention)) continue;
    await notifyMentionedMember(mention, { channel, senderDisplayName, messageExcerpt });
  }
  if (replyTarget) {
    await notifyReplyToAuthor(replyTarget, {
      channel,
      senderDisplayName,
      messageExcerpt,
      replierType: senderType,
      replierAdminId: senderAdminId,
    });
  }

  return { outcome: 'created', message, mentions: mentionsResult.value };
}

/**
 * Edits a message's body/mentions in place, recording a revision. Creates
 * no revision when nothing actually changed (module doc §18 point 6).
 */
async function editMessage({ messageId, newBody, mentionWorkspaceMemberIds, actor }) {
  const message = await WorkspaceMessage.findById(messageId);
  if (!message || message.deletedAt) return { outcome: 'not_found' };

  const channel = await WorkspaceChannel.findById(message.channel);
  if (!channel) return { outcome: 'not_found' };

  const normalizedBody = normalizeBody(newBody);
  if (!normalizedBody && message.attachments.length === 0) {
    return { outcome: 'validation_error', errors: { body: 'Message cannot be empty.' } };
  }

  const mentionsResult = await resolveMentions({
    workspaceId: message.workspace,
    workspaceMemberIds: mentionWorkspaceMemberIds || [],
    channel,
  });
  if (mentionsResult.outcome === 'validation_error') return mentionsResult;

  const previousMentionIds = new Set(message.mentions.map((m) => String(m.workspaceMember)));
  const newMentionIds = new Set(mentionsResult.value.map((m) => String(m.workspaceMember)));
  const mentionsUnchanged =
    previousMentionIds.size === newMentionIds.size && [...previousMentionIds].every((id) => newMentionIds.has(id));
  const bodyUnchanged = normalizedBody === message.body;

  if (bodyUnchanged && mentionsUnchanged) return { outcome: 'unchanged', message };

  const previousBody = message.body;
  const previousMentions = message.mentions;
  const previousAttachments = message.attachments;

  message.body = normalizedBody;
  message.mentions = mentionsResult.value;
  message.editedAt = new Date();

  await saveGuarded(message);

  const revisionNumber = await nextRevisionNumber(message._id);
  await MessageRevision.create({
    message: message._id,
    revisionNumber,
    action: 'edited',
    previousBody,
    newBody: normalizedBody,
    previousAttachments,
    newAttachments: message.attachments,
    previousMentions,
    newMentions: mentionsResult.value,
    actorType: actor.type,
    actorClient: actor.type === 'client' ? actor.id : null,
    actorAdmin: actor.type === 'employee' ? actor.id : null,
  });

  // Only ADDED mentions notify — a removed mention must never generate a
  // new notification (module doc §15 point 8).
  const addedMentions = mentionsResult.value.filter((m) => !previousMentionIds.has(String(m.workspaceMember)));
  const messageExcerpt = excerpt(normalizedBody);
  const editedSelf = (m) =>
    (actor.type === 'client' && m.memberType === 'client' && String(m.clientUser) === String(actor.id)) ||
    (actor.type === 'employee' && m.memberType === 'employee' && String(m.adminUser) === String(actor.id));
  for (const mention of addedMentions) {
    if (editedSelf(mention)) continue;
    await notifyMentionedMember(mention, { channel, senderDisplayName: message.senderDisplayName, messageExcerpt });
  }

  return { outcome: 'updated', message, addedMentions };
}

async function deleteMessage({ messageId, actor, reason }) {
  const message = await WorkspaceMessage.findById(messageId);
  if (!message || message.deletedAt) return { outcome: 'not_found' };

  const previousBody = message.body;

  message.deletedAt = new Date();
  message.deletedByType = actor.type;
  message.deletedByClient = actor.type === 'client' ? actor.id : null;
  message.deletedByAdmin = actor.type === 'employee' ? actor.id : null;
  message.deletionReason = reason || '';

  await saveGuarded(message);

  const revisionNumber = await nextRevisionNumber(message._id);
  await MessageRevision.create({
    message: message._id,
    revisionNumber,
    action: 'soft_deleted',
    previousBody,
    newBody: '',
    actorType: actor.type,
    actorClient: actor.type === 'client' ? actor.id : null,
    actorAdmin: actor.type === 'employee' ? actor.id : null,
    reason: reason || '',
  });

  return { outcome: 'updated', message };
}

async function restoreMessage({ messageId, actor }) {
  const message = await WorkspaceMessage.findById(messageId);
  if (!message || !message.deletedAt) return { outcome: 'not_found' };

  const restoredBody = message.body;

  message.deletedAt = null;
  message.deletedByType = null;
  message.deletedByClient = null;
  message.deletedByAdmin = null;
  message.deletionReason = '';

  await saveGuarded(message);

  const revisionNumber = await nextRevisionNumber(message._id);
  await MessageRevision.create({
    message: message._id,
    revisionNumber,
    action: 'restored',
    previousBody: '',
    newBody: restoredBody,
    actorType: actor.type,
    actorClient: actor.type === 'client' ? actor.id : null,
    actorAdmin: actor.type === 'employee' ? actor.id : null,
  });

  return { outcome: 'updated', message };
}

/**
 * Safe render shape for any consumer (admin EJS views, portal JSON) —
 * deleted messages get a fixed placeholder body, internal-only fields
 * (deletionReason, idempotencyKey) never leave this function.
 */
function serializeMessage(message) {
  const isDeleted = !!message.deletedAt;
  return {
    id: String(message._id),
    channel: String(message.channel),
    senderType: message.senderType,
    senderDisplayName: message.senderDisplayName,
    body: isDeleted ? '[This message was deleted.]' : message.body,
    messageType: message.messageType,
    parentMessage: message.parentMessage ? String(message.parentMessage) : null,
    threadRoot: message.threadRoot ? String(message.threadRoot) : null,
    replyCount: message.replyCount,
    lastReplyAt: message.lastReplyAt,
    mentions: isDeleted
      ? []
      : message.mentions.map((m) => ({ workspaceMember: String(m.workspaceMember), displayName: m.displayNameSnapshot })),
    attachments: isDeleted
      ? []
      : message.attachments.map((a) => ({
          documentId: String(a.document),
          versionId: String(a.documentVersion),
          displayName: a.displayNameSnapshot,
        })),
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
  };
}

module.exports = {
  saveGuarded,
  normalizeBody,
  resolveMentions,
  resolveAttachments,
  createMessage,
  editMessage,
  deleteMessage,
  restoreMessage,
  serializeMessage,
};
