const ActivityLog = require('../models/admin/ActivityLog');

/** Thin wrapper so route code reads as a sentence, and logging failures
 * (should be essentially impossible) never break the calling mutation. */
async function logActivity(leadId, type, message, actor) {
  try {
    await ActivityLog.record(leadId, type, message, actor);
  } catch (err) {
    console.error('[activity] Failed to record activity:', err.message);
  }
}

module.exports = { logActivity };
