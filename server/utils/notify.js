const Notification = require('../models/admin/Notification');

/**
 * In-app notifications only for this pass — no email dispatch. The brief
 * marks email as optional ("optionally by email"); wiring a second mailer
 * into this standalone app is deferred rather than duplicating the
 * intake app's Resend/Gmail integration.
 *
 * `recipientName` is used (not a hard user reference) so this works
 * identically whether the recipient is a DB AdminUser or the env-credential
 * fallback admin, which has no user document at all.
 */
async function notify({ recipientName, title, message, type, relatedLead, relatedTask, relatedCase }) {
  if (!recipientName) return null;
  try {
    return await Notification.create({
      recipientName,
      title,
      message,
      type,
      relatedLead: relatedLead || null,
      relatedTask: relatedTask || null,
      relatedCase: relatedCase || null,
    });
  } catch (err) {
    // Notifications are a convenience layer — a failure here must never
    // break the underlying lead/task mutation that triggered it.
    console.error('[notify] Failed to create notification:', err.message);
    return null;
  }
}

/** Notify every distinct name in a list (owner + assignees, de-duplicated). */
async function notifyMany(names, payload) {
  const unique = [...new Set((names || []).filter(Boolean))];
  await Promise.all(unique.map((recipientName) => notify({ ...payload, recipientName })));
}

module.exports = { notify, notifyMany };
