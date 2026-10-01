import "server-only";

import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { CaseDocument } from "../models/CaseDocument";
import { encodeCursor, decodeCursor, cursorFilter, changedFilter, boundedLimit } from "../content/message-cursor";
import { MESSAGE_EDIT_WINDOW_MS } from "../content/collaboration-constants";

/**
 * Client-side read model for the portal chat (ADR-020 §23/§24). The staff
 * counterpart is server/services/staffChatService.js; the two share the
 * WorkspaceMessage collection but deliberately not a DTO — this one never
 * carries employee ids, the idempotency key, deletion reasons or storage data.
 *
 * Callers pass a channel already authorised through getAccessibleChannel().
 * Every query also excludes `clientVisible: false` rows: a system message
 * about an internal document lives in a client-visible channel but must not
 * reach the client (defence in depth beside the channel-level check).
 */

type MessageRow = {
  _id: unknown;
  channel: unknown;
  senderType: string;
  senderClient?: unknown;
  senderDisplayName: string;
  body: string;
  messageType: string;
  parentMessage?: unknown;
  threadRoot?: unknown;
  replyCount: number;
  lastReplyAt?: Date | null;
  mentions: { workspaceMember: unknown; displayNameSnapshot: string }[];
  attachments: { document: unknown; documentVersion: unknown; displayNameSnapshot: string }[];
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientChatMessage = {
  id: string;
  senderType: string;
  senderDisplayName: string;
  isOwn: boolean;
  body: string;
  threadRootId: string | null;
  replyCount: number;
  attachments: { documentId: string; displayName: string; mimeType: string; extension: string; size: number }[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

async function shapeMessages(rows: MessageRow[], clientUserId: string): Promise<ClientChatMessage[]> {
  const documentIds = [...new Set(rows.flatMap((m) => m.attachments.map((a) => String(a.document))))];
  const documents = documentIds.length
    ? await CaseDocument.find({ _id: { $in: documentIds }, visibility: "client_visible", status: { $nin: ["quarantined", "archived", "rejected"] } })
        .select("detectedMimeType mimeType extension size")
        .lean()
    : [];
  const documentById = new Map(documents.map((d) => [String(d._id), d]));

  return rows.map((m) => {
    const deleted = !!m.deletedAt;
    const isOwn = m.senderType === "client" && String(m.senderClient) === clientUserId;
    return {
      id: String(m._id),
      senderType: m.senderType,
      senderDisplayName: m.senderDisplayName,
      isOwn,
      body: deleted ? "[This message was deleted.]" : m.body,
      threadRootId: m.threadRoot ? String(m.threadRoot) : null,
      replyCount: m.replyCount,
      // An attachment whose document is no longer client-visible simply drops out — no name, no hint.
      attachments: deleted
        ? []
        : m.attachments.flatMap((a) => {
            const doc = documentById.get(String(a.document));
            return doc
              ? [{ documentId: String(a.document), displayName: a.displayNameSnapshot, mimeType: doc.detectedMimeType || doc.mimeType, extension: doc.extension, size: doc.size }]
              : [];
          }),
      editedAt: iso(m.editedAt),
      deletedAt: iso(m.deletedAt),
      createdAt: iso(m.createdAt) as string,
      updatedAt: iso(m.updatedAt) as string,
      canEdit: isOwn && !deleted && Date.now() - new Date(m.createdAt).getTime() <= MESSAGE_EDIT_WINDOW_MS,
      canDelete: isOwn && !deleted,
    };
  });
}

const visibleToClient = { clientVisible: { $ne: false } };

const syncCursorOf = (m: { updatedAt: Date; _id: unknown }) => encodeCursor({ createdAt: m.updatedAt, id: String(m._id) });

/** Newest page of root messages (oldest-first), plus the cursors for older history and for polling. */
export async function loadClientMessagesPage(channelId: unknown, clientUserId: string, opts: { before?: unknown; limit?: unknown } = {}) {
  const pageSize = boundedLimit(opts.limit);
  const rows = (await WorkspaceMessage.find({ channel: channelId, parentMessage: null, ...visibleToClient, ...cursorFilter(decodeCursor(opts.before)) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageSize)
    .lean()) as unknown as MessageRow[];
  const newest = (await WorkspaceMessage.findOne({ channel: channelId, ...visibleToClient })
    .sort({ updatedAt: -1, _id: -1 })
    .select("updatedAt")
    .lean()) as { updatedAt: Date; _id: unknown } | null;
  const last = rows[rows.length - 1];
  return {
    messages: await shapeMessages(rows.slice().reverse(), clientUserId),
    nextCursor: rows.length === pageSize ? encodeCursor({ createdAt: last.createdAt, id: String(last._id) }) : null,
    syncCursor: newest ? syncCursorOf(newest) : null,
  };
}

/** Everything created or changed (edit, delete, reply count) after `since` — roots and replies. */
export async function loadClientChanges(channelId: unknown, clientUserId: string, opts: { since?: unknown; limit?: unknown } = {}) {
  const pageSize = boundedLimit(opts.limit);
  const rows = (await WorkspaceMessage.find({ channel: channelId, ...visibleToClient, ...changedFilter(decodeCursor(opts.since)) })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(pageSize)
    .lean()) as unknown as MessageRow[];
  const last = rows[rows.length - 1];
  return {
    messages: await shapeMessages(rows, clientUserId),
    syncCursor: last ? syncCursorOf(last) : typeof opts.since === "string" ? opts.since : null,
    hasMore: rows.length === pageSize,
  };
}

/** A thread: the root plus its replies (oldest-first), or null when the root is not in this channel / not client-visible. */
export async function loadClientThread(channelId: unknown, rootId: string, clientUserId: string) {
  const root = (await WorkspaceMessage.findOne({ _id: rootId, channel: channelId, parentMessage: null, ...visibleToClient }).lean()) as unknown as MessageRow | null;
  if (!root) return null;
  const replies = (await WorkspaceMessage.find({ threadRoot: root._id, ...visibleToClient })
    .sort({ createdAt: 1, _id: 1 })
    .limit(boundedLimit(undefined))
    .lean()) as unknown as MessageRow[];
  const shaped = await shapeMessages([root, ...replies], clientUserId);
  const newest = [root, ...replies].reduce((a, b) => (new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a));
  return { root: shaped[0], replies: shaped.slice(1), syncCursor: syncCursorOf(newest) };
}
