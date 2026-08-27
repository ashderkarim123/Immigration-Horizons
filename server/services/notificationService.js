const Notification = require('../models/admin/Notification');
const NotificationPreference = require('../models/admin/NotificationPreference');
const WorkspaceMember = require('../models/WorkspaceMember');

const RELATED_FIELDS = [
  'relatedLead',
  'relatedTask',
  'relatedCase',
  'relatedInteraction',
  'relatedDocument',
  'relatedDocumentRequest',
  'relatedChannel',
  'relatedMessage',
];

function pickRelated(payload) {
  const out = {};
  for (const field of RELATED_FIELDS) out[field] = payload[field] || null;
  return out;
}

/**
 * The one place a Notification document is ever created. Handles the
 * dedupeKey race the same way every idempotent-create in this codebase
 * does (Cycle 5/6 precedent): let the unique index reject a concurrent
 * duplicate, then fetch and return the winner instead of erroring.
 */
async function createNotification({
  recipientType,
  recipientAdminId = null,
  recipientClientId = null,
  recipientName = '',
  title,
  message,
  type,
  emailState = 'not_applicable',
  dedupeKey = null,
  ...rest
}) {
  const doc = {
    recipientType,
    recipientAdmin: recipientType === 'employee' ? recipientAdminId || null : null,
    recipientClient: recipientType === 'client' ? recipientClientId || null : null,
    // Legacy fields — always populated for employee recipients so the
    // existing admin bell query keeps working unmodified (ADR-006 §1).
    recipientId: recipientType === 'employee' ? recipientAdminId || null : null,
    recipientName,
    title,
    message,
    type,
    emailState,
    dedupeKey,
    ...pickRelated(rest),
  };

  try {
    return await Notification.create(doc);
  } catch (err) {
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.dedupeKey) {
      const existing = await Notification.findOne({ dedupeKey });
      if (existing) return existing;
    }
    // Notifications are a convenience layer — a failure here must never
    // break the underlying mutation that triggered it (documentEmail.js /
    // interactionEmail.js precedent).
    console.error('[notificationService] Failed to create notification:', err.message);
    return null;
  }
}

/** Employee recipient — always created; employees never need the removed-member guard clients do. */
async function notifyEmployee({ adminUserId, adminUserName, title, message, type, dedupeKey, ...rest }) {
  if (!adminUserName) return null;
  return createNotification({
    recipientType: 'employee',
    recipientAdminId: adminUserId || null,
    recipientName: adminUserName,
    title,
    message,
    type,
    dedupeKey,
    ...rest,
  });
}

/**
 * Client recipient. `requireActiveWorkspace` (a workspace id) is checked
 * before writing — a client removed from a case's workspace must not
 * receive new notifications about it (ADR-006 §6, module doc "removed
 * member receives no event" test requirement). Pass it whenever the
 * caller has the workspace in scope; omitted only where no workspace
 * context exists yet (there are none such call sites this cycle, but the
 * guard is opt-in rather than forced so it never becomes a required
 * argument for a future notification type that isn't case-scoped).
 */
async function notifyClient({ clientUserId, title, message, type, dedupeKey, requireActiveWorkspace = null, ...rest }) {
  if (!clientUserId) return null;
  if (requireActiveWorkspace) {
    const isActive = await WorkspaceMember.exists({
      workspace: requireActiveWorkspace,
      memberType: 'client',
      clientUser: clientUserId,
      status: 'active',
    });
    if (!isActive) return null;
  }
  return createNotification({
    recipientType: 'client',
    recipientClientId: clientUserId,
    title,
    message,
    type,
    dedupeKey,
    ...rest,
  });
}

/** Lazily creates a default-preferences row on first read (ADR-006 §8). */
async function getOrCreatePreferences({ recipientType, recipientAdminId = null, recipientClientId = null }) {
  const filter =
    recipientType === 'employee' ? { recipientAdmin: recipientAdminId } : { recipientClient: recipientClientId };
  const existing = await NotificationPreference.findOne(filter);
  if (existing) return existing;
  try {
    return await NotificationPreference.create({
      recipientType,
      recipientAdmin: recipientType === 'employee' ? recipientAdminId : null,
      recipientClient: recipientType === 'client' ? recipientClientId : null,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const raced = await NotificationPreference.findOne(filter);
      if (raced) return raced;
    }
    throw err;
  }
}

async function updatePreferences({ recipientType, recipientAdminId = null, recipientClientId = null, updates }) {
  const prefs = await getOrCreatePreferences({ recipientType, recipientAdminId, recipientClientId });
  const allowed = ['mentionEmails', 'digestEmails', 'digestFrequency'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) prefs[key] = updates[key];
  }
  await prefs.save();
  return prefs;
}

function recipientFilter({ recipientType, recipientAdminId = null, recipientClientId = null }) {
  return recipientType === 'employee'
    ? { recipientType: 'employee', recipientAdmin: recipientAdminId }
    : { recipientType: 'client', recipientClient: recipientClientId };
}

async function listForRecipient({ recipientType, recipientAdminId, recipientClientId, limit = 20, unreadOnly = false }) {
  const filter = recipientFilter({ recipientType, recipientAdminId, recipientClientId });
  if (unreadOnly) filter.read = false;
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return Notification.find(filter).sort({ createdAt: -1 }).limit(boundedLimit).lean();
}

async function getUnreadCount({ recipientType, recipientAdminId, recipientClientId }) {
  return Notification.countDocuments({
    ...recipientFilter({ recipientType, recipientAdminId, recipientClientId }),
    read: false,
  });
}

/** Ownership-checked — a recipient can only mark their own notification read. */
async function markRead({ notificationId, recipientType, recipientAdminId, recipientClientId }) {
  const filter = { _id: notificationId, ...recipientFilter({ recipientType, recipientAdminId, recipientClientId }) };
  return Notification.findOneAndUpdate(filter, { $set: { read: true, readAt: new Date() } }, { returnDocument: 'after' });
}

async function markAllRead({ recipientType, recipientAdminId, recipientClientId }) {
  const filter = { ...recipientFilter({ recipientType, recipientAdminId, recipientClientId }), read: false };
  return Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
}

module.exports = {
  createNotification,
  notifyEmployee,
  notifyClient,
  getOrCreatePreferences,
  updatePreferences,
  listForRecipient,
  getUnreadCount,
  markRead,
  markAllRead,
};
