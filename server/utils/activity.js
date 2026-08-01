const ActivityLog = require('../models/admin/ActivityLog');

/** Thin wrapper so route code reads as a sentence, and logging failures
 * (should be essentially impossible) never break the calling mutation.
 * `meta` is optional structured data (e.g. previous/new values) alongside
 * the human-readable `message` — see ActivityLog's `meta: Mixed` field. */
async function logActivity(leadId, type, message, actor, meta) {
  try {
    await ActivityLog.record(leadId, type, message, actor, meta);
  } catch (err) {
    console.error('[activity] Failed to record activity:', err.message);
  }
}

module.exports = { logActivity };
