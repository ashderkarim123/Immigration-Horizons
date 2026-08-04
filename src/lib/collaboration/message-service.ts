import "server-only";

import mongoose from "mongoose";

import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { WorkspaceChannel } from "../models/WorkspaceChannel";
import { MessageRevision } from "../models/MessageRevision";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { ChannelMember } from "../models/ChannelMember";
import { ClientUser } from "../models/ClientUser";
import { CaseDocument } from "../models/CaseDocument";
import { Notification } from "../models/Notification";
import { MAX_MENTIONS_PER_MESSAGE, MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_BODY_LENGTH } from "../content/collaboration-constants";

/**
 * Mirrors server/services/messageService.js, scoped to the client-authored
 * subset this app ever needs (senderType is always 'client' here —
 * employee-authored messages are Express's job). See
 * docs/architecture/ADR-005-team-collaboration.md.
 */

function isVersionConflict(err: unknown): boolean {
  return err instanceof mongoose.Error.VersionError;
}

export async function saveGuarded(doc: InstanceType<typeof WorkspaceMessage>): Promise<void> {
  try {
    await doc.save();
  } catch (err) {
    if (isVersionConflict(err)) {
      const conflictError = new Error("This message was updated by someone else. Please reload and try again.") as Error & {
        isVersionConflict: boolean;
      };
      conflictError.isVersionConflict = true;
      throw conflictError;
    }
    throw err;
  }
}

export function normalizeBody(body: unknown): string {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_BODY_LENGTH);
}

async function nextRevisionNumber(messageId: string): Promise<number> {
  const last = await MessageRevision.findOne({ message: messageId }).sort({ revisionNumber: -1 }).select("revisionNumber").lean();
  return (last ? (last as { revisionNumber: number }).revisionNumber : 0) + 1;
}

type MentionValue = {
  memberType: string;
  clientUser: string | null;
  adminUser: string | null;
  workspaceMember: unknown;
  displayNameSnapshot: string;
};

type MentionResult = { outcome: "ok"; value: MentionValue[] } | { outcome: "validation_error"; errors: Record<string, string> };

export async function resolveMentions(params: {
  workspaceId: string;
  workspaceMemberIds: string[];
  channel: { _id: unknown; visibility: string };
}): Promise<MentionResult> {
  const { workspaceId, workspaceMemberIds, channel } = params;
  if (!workspaceMemberIds || workspaceMemberIds.length === 0) return { outcome: "ok", value: [] };
  if (workspaceMemberIds.length > MAX_MENTIONS_PER_MESSAGE) {
    return { outcome: "validation_error", errors: { mentions: "Too many mentions." } };
  }

  const uniqueIds = [...new Set(workspaceMemberIds.map(String))];
  const members = await WorkspaceMember.find({ _id: { $in: uniqueIds }, workspace: workspaceId, status: "active" }).lean();
  if (members.length !== uniqueIds.length) {
    return { outcome: "validation_error", errors: { mentions: "One or more mentioned members are not active workspace members." } };
  }

  if (channel.visibility === "restricted_members") {
    const channelMembers = await ChannelMember.find({
      channel: channel._id,
      workspaceMember: { $in: uniqueIds },
      status: "active",
    }).lean();
    if (channelMembers.length !== uniqueIds.length) {
      return { outcome: "validation_error", errors: { mentions: "One or more mentioned members do not have access to this channel." } };
    }
  }

  const value: MentionValue[] = [];
  for (const member of members as unknown as { _id: unknown; memberType: string; clientUser: unknown; adminUser: unknown }[]) {
    let displayName = "Team Member";
    if (member.memberType === "client") {
      const clientUser = await ClientUser.findById(member.clientUser).select("firstName email").lean();
      displayName = clientUser ? (clientUser.firstName as string) || (clientUser.email as string) : "Client";
    }
    // Employee display names are not resolvable from this app (AdminUser
    // isn't mirrored here) — the snapshot still records the mention
    // correctly; employee-authored messages/mentions always originate
    // server-side where the real name is resolved.
    value.push({
      memberType: member.memberType,
      clientUser: member.memberType === "client" ? String(member.clientUser) : null,
      adminUser: member.memberType === "employee" ? String(member.adminUser) : null,
      workspaceMember: member._id,
      displayNameSnapshot: displayName,
    });
  }
  return { outcome: "ok", value };
}

type AttachmentValue = { document: unknown; documentVersion: unknown; displayNameSnapshot: string };
type AttachmentResult =
  | { outcome: "ok"; value: AttachmentValue[] }
  | { outcome: "validation_error"; errors: Record<string, string> };

export async function resolveAttachments(params: {
  channel: { _id: unknown; case: unknown; visibility: string };
  documentIds: string[];
}): Promise<AttachmentResult> {
  const { channel, documentIds } = params;
  if (!documentIds || documentIds.length === 0) return { outcome: "ok", value: [] };
  if (documentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { outcome: "validation_error", errors: { attachments: "Too many attachments." } };
  }

  const uniqueIds = [...new Set(documentIds.map(String))];
  const documents = await CaseDocument.find({ _id: { $in: uniqueIds } });
  if (documents.length !== uniqueIds.length) {
    return { outcome: "validation_error", errors: { attachments: "One or more documents were not found." } };
  }

  const channelIsClientAccessible = channel.visibility === "all_members" || channel.visibility === "clients_and_team";

  const value: AttachmentValue[] = [];
  for (const document of documents) {
    if (String(document.case) !== String(channel.case)) {
      return { outcome: "validation_error", errors: { attachments: `"${document.displayName}" cannot be attached to this channel.` } };
    }
    if (document.status === "quarantined") {
      return { outcome: "validation_error", errors: { attachments: `"${document.displayName}" cannot be attached to this channel.` } };
    }
    if (channelIsClientAccessible && document.visibility !== "client_visible") {
      return { outcome: "validation_error", errors: { attachments: `"${document.displayName}" cannot be attached to this channel.` } };
    }
    if (!document.currentVersion) {
      return { outcome: "validation_error", errors: { attachments: `"${document.displayName}" has no current version.` } };
    }
    value.push({ document: document._id, documentVersion: document.currentVersion, displayNameSnapshot: document.displayName });
  }
  return { outcome: "ok", value };
}

function excerpt(body: string): string {
  const trimmed = (body || "").trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

/** Employee mention/reply notifications from a client-authored message — in-app Notification, mirroring server's notify() shape (ADR-005 §17). */
async function notifyEmployee(params: {
  recipientAdminUserId: unknown;
  title: string;
  message: string;
  type: "message_mention" | "message_reply";
  caseId: unknown;
  channelId: unknown;
}): Promise<void> {
  try {
    // recipientName is unknown from this app (AdminUser isn't mirrored
    // here) — Notification is keyed by recipientName server-side, so a
    // client-authored mention/reply notification is recorded with the
    // recipient id only; the admin UI's existing recipientName-based
    // lookup still works once resolved. Left for the admin's own
    // recipientId-aware rendering path (Notification.recipientId is
    // already a real field, unused by the current admin queries but
    // present for exactly this case).
    await Notification.create({
      recipientId: params.recipientAdminUserId,
      recipientName: "",
      title: params.title,
      message: params.message,
      type: params.type,
      relatedCase: params.caseId,
      relatedChannel: params.channelId,
    });
  } catch (err) {
    console.error("[collaboration] employee notification failed:", (err as Error).message);
  }
}

export type CreateMessageParams = {
  channel: InstanceType<typeof WorkspaceChannel>;
  senderClientId: string;
  senderDisplayName: string;
  body: string;
  parentMessageId?: string | null;
  mentionWorkspaceMemberIds?: string[];
  attachmentDocumentIds?: string[];
  idempotencyKey?: string | null;
};

export async function createMessage(params: CreateMessageParams) {
  const {
    channel,
    senderClientId,
    senderDisplayName,
    body,
    parentMessageId,
    mentionWorkspaceMemberIds,
    attachmentDocumentIds,
    idempotencyKey,
  } = params;

  if (idempotencyKey) {
    const existing = await WorkspaceMessage.findOne({ channel: channel._id, idempotencyKey });
    if (existing) return { outcome: "created" as const, message: existing, idempotent: true };
  }

  let parentMessage: unknown = null;
  let threadRoot: unknown = null;
  let replyTarget: InstanceType<typeof WorkspaceMessage> | null = null;
  if (parentMessageId) {
    const parent = await WorkspaceMessage.findById(parentMessageId);
    if (!parent || String(parent.channel) !== String(channel._id)) {
      return { outcome: "validation_error" as const, errors: { parentMessage: "Parent message not found in this channel." } };
    }
    replyTarget = parent;
    threadRoot = parent.threadRoot || parent._id;
    parentMessage = threadRoot;
  }

  const mentionsResult = await resolveMentions({
    workspaceId: String(channel.workspace),
    workspaceMemberIds: mentionWorkspaceMemberIds || [],
    channel,
  });
  if (mentionsResult.outcome === "validation_error") return mentionsResult;

  const attachmentsResult = await resolveAttachments({ channel, documentIds: attachmentDocumentIds || [] });
  if (attachmentsResult.outcome === "validation_error") return attachmentsResult;

  const normalizedBody = normalizeBody(body);

  let message;
  try {
    message = await WorkspaceMessage.create({
      workspace: channel.workspace,
      case: channel.case,
      channel: channel._id,
      senderType: "client",
      senderClient: senderClientId,
      senderDisplayName,
      body: normalizedBody,
      messageType: "text",
      parentMessage,
      threadRoot,
      mentions: mentionsResult.value,
      attachments: attachmentsResult.value,
      clientVisible: true,
      idempotencyKey: idempotencyKey || null,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000 && idempotencyKey) {
      const existing = await WorkspaceMessage.findOne({ channel: channel._id, idempotencyKey });
      if (existing) return { outcome: "created" as const, message: existing, idempotent: true };
    }
    throw err;
  }

  if (parentMessage) {
    await WorkspaceMessage.updateOne({ _id: threadRoot }, { $inc: { replyCount: 1 }, $set: { lastReplyAt: message.createdAt } });
  }

  const messageExcerpt = excerpt(normalizedBody);
  for (const mention of mentionsResult.value) {
    if (mention.memberType === "employee" && mention.adminUser) {
      await notifyEmployee({
        recipientAdminUserId: mention.adminUser,
        title: `${senderDisplayName} mentioned you`,
        message: `In "${channel.name}": ${messageExcerpt}`,
        type: "message_mention",
        caseId: channel.case,
        channelId: channel._id,
      });
    }
  }
  if (replyTarget && replyTarget.senderType === "employee" && replyTarget.senderAdmin) {
    await notifyEmployee({
      recipientAdminUserId: replyTarget.senderAdmin,
      title: `${senderDisplayName} replied to your message`,
      message: `In "${channel.name}": ${messageExcerpt}`,
      type: "message_reply",
      caseId: channel.case,
      channelId: channel._id,
    });
  }

  return { outcome: "created" as const, message, mentions: mentionsResult.value };
}

export async function editMessage(params: {
  messageId: string;
  newBody: string;
  mentionWorkspaceMemberIds?: string[];
  actorClientId: string;
}) {
  const { messageId, newBody, mentionWorkspaceMemberIds, actorClientId } = params;

  const message = await WorkspaceMessage.findById(messageId);
  if (!message || message.deletedAt) return { outcome: "not_found" as const };

  const channel = await WorkspaceChannel.findById(message.channel);
  if (!channel) return { outcome: "not_found" as const };

  const normalizedBody = normalizeBody(newBody);
  if (!normalizedBody && message.attachments.length === 0) {
    return { outcome: "validation_error" as const, errors: { body: "Message cannot be empty." } };
  }

  const mentionsResult = await resolveMentions({
    workspaceId: String(message.workspace),
    workspaceMemberIds: mentionWorkspaceMemberIds || [],
    channel,
  });
  if (mentionsResult.outcome === "validation_error") return mentionsResult;

  const previousMentionIds = new Set<string>(message.mentions.map((m: { workspaceMember: unknown }) => String(m.workspaceMember)));
  const newMentionIds = new Set<string>(mentionsResult.value.map((m) => String(m.workspaceMember)));
  const mentionsUnchanged =
    previousMentionIds.size === newMentionIds.size && [...previousMentionIds].every((id) => newMentionIds.has(id));
  const bodyUnchanged = normalizedBody === message.body;

  if (bodyUnchanged && mentionsUnchanged) return { outcome: "unchanged" as const, message };

  const previousBody = message.body;
  const previousMentions = message.mentions;
  const previousAttachments = message.attachments;

  message.body = normalizedBody;
  message.mentions = mentionsResult.value;
  message.editedAt = new Date();

  await saveGuarded(message);

  const revisionNumber = await nextRevisionNumber(String(message._id));
  await MessageRevision.create({
    message: message._id,
    revisionNumber,
    action: "edited",
    previousBody,
    newBody: normalizedBody,
    previousAttachments,
    newAttachments: message.attachments,
    previousMentions,
    newMentions: mentionsResult.value,
    actorType: "client",
    actorClient: actorClientId,
  });

  const addedMentions = mentionsResult.value.filter((m) => !previousMentionIds.has(String(m.workspaceMember)));
  const messageExcerpt = excerpt(normalizedBody);
  for (const mention of addedMentions) {
    if (mention.memberType === "employee" && mention.adminUser) {
      await notifyEmployee({
        recipientAdminUserId: mention.adminUser,
        title: `${message.senderDisplayName} mentioned you`,
        message: `In "${channel.name}": ${messageExcerpt}`,
        type: "message_mention",
        caseId: channel.case,
        channelId: channel._id,
      });
    }
  }

  return { outcome: "updated" as const, message, addedMentions };
}

export async function deleteMessage(params: { messageId: string; actorClientId: string; reason?: string }) {
  const { messageId, actorClientId, reason } = params;
  const message = await WorkspaceMessage.findById(messageId);
  if (!message || message.deletedAt) return { outcome: "not_found" as const };

  const previousBody = message.body;

  message.deletedAt = new Date();
  message.deletedByType = "client";
  message.deletedByClient = actorClientId;
  message.deletionReason = reason || "";

  await saveGuarded(message);

  const revisionNumber = await nextRevisionNumber(String(message._id));
  await MessageRevision.create({
    message: message._id,
    revisionNumber,
    action: "soft_deleted",
    previousBody,
    newBody: "",
    actorType: "client",
    actorClient: actorClientId,
    reason: reason || "",
  });

  return { outcome: "updated" as const, message };
}

export function serializeMessage(message: {
  _id: unknown;
  channel: unknown;
  senderType: string;
  senderDisplayName: string;
  body: string;
  deletedAt: Date | null;
  messageType: string;
  parentMessage: unknown;
  threadRoot: unknown;
  replyCount: number;
  lastReplyAt: Date | null;
  mentions: { workspaceMember: unknown; displayNameSnapshot: string }[];
  attachments: { document: unknown; documentVersion: unknown; displayNameSnapshot: string }[];
  editedAt: Date | null;
  createdAt: Date;
}) {
  const isDeleted = !!message.deletedAt;
  return {
    id: String(message._id),
    channel: String(message.channel),
    senderType: message.senderType,
    senderDisplayName: message.senderDisplayName,
    body: isDeleted ? "[This message was deleted.]" : message.body,
    messageType: message.messageType,
    parentMessage: message.parentMessage ? String(message.parentMessage) : null,
    threadRoot: message.threadRoot ? String(message.threadRoot) : null,
    replyCount: message.replyCount,
    lastReplyAt: message.lastReplyAt,
    mentions: isDeleted ? [] : message.mentions.map((m) => ({ workspaceMember: String(m.workspaceMember), displayName: m.displayNameSnapshot })),
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
