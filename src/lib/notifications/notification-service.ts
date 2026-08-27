import "server-only";

import { Notification } from "../models/Notification";
import { NotificationPreference } from "../models/NotificationPreference";
import { WorkspaceMember } from "../models/WorkspaceMember";

/**
 * Mirrors server/services/notificationService.js exactly (Cycle 7 —
 * ADR-006 §1). This is the one place either app's client-facing code
 * creates a Notification document — message-service.ts and
 * interactions.ts both call notifyEmployee/notifyClient here rather than
 * writing to the model directly, matching the server's own
 * notify.js -> notificationService.js layering.
 */

type RelatedFields = {
  relatedLead?: unknown;
  relatedTask?: unknown;
  relatedCase?: unknown;
  relatedInteraction?: unknown;
  relatedDocument?: unknown;
  relatedDocumentRequest?: unknown;
  relatedChannel?: unknown;
  relatedMessage?: unknown;
};

async function createNotification(params: {
  recipientType: "employee" | "client";
  recipientAdminId?: unknown;
  recipientClientId?: unknown;
  title: string;
  message: string;
  type: string;
  dedupeKey?: string | null;
} & RelatedFields) {
  const { recipientType, recipientAdminId, recipientClientId, title, message, type, dedupeKey, ...related } = params;
  const doc = {
    recipientType,
    recipientAdmin: recipientType === "employee" ? recipientAdminId || null : null,
    recipientClient: recipientType === "client" ? recipientClientId || null : null,
    recipientId: recipientType === "employee" ? recipientAdminId || null : null,
    recipientName: "",
    title,
    message,
    type,
    dedupeKey: dedupeKey || null,
    ...related,
  };

  try {
    return await Notification.create(doc);
  } catch (err) {
    const mongoErr = err as { code?: number; keyPattern?: Record<string, unknown> };
    if (mongoErr.code === 11000 && mongoErr.keyPattern?.dedupeKey && dedupeKey) {
      const existing = await Notification.findOne({ dedupeKey });
      if (existing) return existing;
    }
    console.error("[notification-service] Failed to create notification:", (err as Error).message);
    return null;
  }
}

export async function notifyEmployee(
  params: { adminUserId: unknown; title: string; message: string; type: string; dedupeKey?: string | null } & RelatedFields,
) {
  const { adminUserId, ...rest } = params;
  if (!adminUserId) return null;
  return createNotification({ recipientType: "employee", recipientAdminId: adminUserId, ...rest });
}

/**
 * `requireActiveWorkspace` guards against notifying a client who has been
 * removed from the case's workspace (ADR-006 §6, module doc "removed
 * member receives no event"). Pass null/omit when there's no workspace
 * context (there are none such call sites in this app yet).
 */
export async function notifyClient(
  params: {
    clientUserId: unknown;
    requireActiveWorkspace?: unknown;
    title: string;
    message: string;
    type: string;
    dedupeKey?: string | null;
  } & RelatedFields,
) {
  const { clientUserId, requireActiveWorkspace, ...rest } = params;
  if (!clientUserId) return null;
  if (requireActiveWorkspace) {
    const isActive = await WorkspaceMember.exists({
      workspace: requireActiveWorkspace,
      memberType: "client",
      clientUser: clientUserId,
      status: "active",
    });
    if (!isActive) return null;
  }
  return createNotification({ recipientType: "client", recipientClientId: clientUserId, ...rest });
}

export async function getOrCreatePreferences(params: { recipientType: "employee" | "client"; recipientAdminId?: unknown; recipientClientId?: unknown }) {
  const { recipientType, recipientAdminId, recipientClientId } = params;
  const filter = recipientType === "employee" ? { recipientAdmin: recipientAdminId } : { recipientClient: recipientClientId };
  const existing = await NotificationPreference.findOne(filter);
  if (existing) return existing;
  try {
    return await NotificationPreference.create({
      recipientType,
      recipientAdmin: recipientType === "employee" ? recipientAdminId : null,
      recipientClient: recipientType === "client" ? recipientClientId : null,
    });
  } catch (err) {
    const mongoErr = err as { code?: number };
    if (mongoErr.code === 11000) {
      const raced = await NotificationPreference.findOne(filter);
      if (raced) return raced;
    }
    throw err;
  }
}

export async function updateClientPreferences(params: {
  clientUserId: unknown;
  updates: { mentionEmails?: boolean; digestEmails?: boolean; digestFrequency?: "daily" | "weekly" | "off" };
}) {
  const prefs = await getOrCreatePreferences({ recipientType: "client", recipientClientId: params.clientUserId });
  const allowed = ["mentionEmails", "digestEmails", "digestFrequency"] as const;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(params.updates, key)) {
      (prefs as unknown as Record<string, unknown>)[key] = params.updates[key];
    }
  }
  await prefs.save();
  return prefs;
}

function recipientFilter(params: { recipientClientId: unknown }) {
  return { recipientType: "client", recipientClient: params.recipientClientId };
}

export async function listForClient(params: { clientUserId: unknown; limit?: number; unreadOnly?: boolean }) {
  const filter: Record<string, unknown> = recipientFilter({ recipientClientId: params.clientUserId });
  if (params.unreadOnly) filter.read = false;
  const boundedLimit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
  return Notification.find(filter).sort({ createdAt: -1 }).limit(boundedLimit).lean();
}

export async function getUnreadCountForClient(clientUserId: unknown): Promise<number> {
  return Notification.countDocuments({ ...recipientFilter({ recipientClientId: clientUserId }), read: false });
}

export async function markReadForClient(params: { notificationId: unknown; clientUserId: unknown }) {
  return Notification.findOneAndUpdate(
    { _id: params.notificationId, ...recipientFilter({ recipientClientId: params.clientUserId }) },
    { $set: { read: true, readAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function markAllReadForClient(clientUserId: unknown) {
  return Notification.updateMany(
    { ...recipientFilter({ recipientClientId: clientUserId }), read: false },
    { $set: { read: true, readAt: new Date() } },
  );
}
