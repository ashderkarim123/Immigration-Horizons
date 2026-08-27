const { notifyEmployee } = require('../services/notificationService');

/**
 * Thin backward-compatible wrapper over notificationService.notifyEmployee
 * (Cycle 7 — ADR-006 §1). Every one of this codebase's original 15 call
 * sites already had a real AdminUser id in scope; each was updated to
 * pass `recipientAdminId` alongside the pre-existing `recipientName`, so
 * every new notification is addressable by identity while the admin
 * bell's `recipientName`-keyed query keeps working unmodified.
 *
 * `recipientAdminId` is optional (not every historical caller has been
 * re-verified to have one) — omitting it degrades gracefully to the
 * pre-Cycle-7 name-only behavior rather than failing the notification.
 */
async function notify({
  recipientName,
  recipientAdminId = null,
  title,
  message,
  type,
  relatedLead,
  relatedTask,
  relatedCase,
  relatedInteraction,
  relatedDocument,
  relatedDocumentRequest,
  relatedChannel,
  relatedMessage,
  dedupeKey,
}) {
  return notifyEmployee({
    adminUserId: recipientAdminId,
    adminUserName: recipientName,
    title,
    message,
    type,
    relatedLead,
    relatedTask,
    relatedCase,
    relatedInteraction,
    relatedDocument,
    relatedDocumentRequest,
    relatedChannel,
    relatedMessage,
    dedupeKey,
  });
}

/**
 * Notify several employees at once. Each entry may be a plain name string
 * (legacy — no identity) or a `{ name, adminId }` pair. De-duplicated by
 * name, matching the pre-Cycle-7 behavior exactly.
 */
async function notifyMany(recipients, payload) {
  const normalized = (recipients || [])
    .map((r) => (typeof r === 'string' ? { name: r, adminId: null } : r))
    .filter((r) => r && r.name);
  const seen = new Set();
  const unique = normalized.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
  await Promise.all(unique.map((r) => notify({ ...payload, recipientName: r.name, recipientAdminId: r.adminId })));
}

module.exports = { notify, notifyMany };
