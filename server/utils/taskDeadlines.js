/**
 * Shared overdue/due-soon logic for Task documents, used by the leads list
 * filters+summary, the lead detail panel, and (indirectly, via the same
 * definition) anywhere else that needs to agree on what "overdue" means.
 *
 * `views/admin/tasks/index.ejs` has its own inline `isOverdue()` for the
 * task board — left as-is (same definition, just not worth wiring a
 * server-rendered EJS template up to a required JS module for one boolean).
 */

const DUE_SOON_DAYS = 3;

function dueSoonThreshold(from) {
  const d = new Date(from || Date.now());
  d.setDate(d.getDate() + DUE_SOON_DAYS);
  return d;
}

/** Mongo match fragment: an incomplete task whose due date has passed. */
function overdueTaskMatch(now) {
  const at = now || new Date();
  return { status: { $ne: 'completed' }, dueDate: { $ne: null, $lt: at } };
}

/** Mongo match fragment: an incomplete task due within DUE_SOON_DAYS (not already overdue). */
function dueSoonTaskMatch(now) {
  const at = now || new Date();
  return { status: { $ne: 'completed' }, dueDate: { $gte: at, $lte: dueSoonThreshold(at) } };
}

function isOverdue(task, now) {
  if (!task || task.status === 'completed' || !task.dueDate) return false;
  return new Date(task.dueDate) < (now || new Date());
}

function isDueSoon(task, now) {
  if (!task || task.status === 'completed' || !task.dueDate) return false;
  const at = now || new Date();
  const due = new Date(task.dueDate);
  return due >= at && due <= dueSoonThreshold(at);
}

module.exports = { DUE_SOON_DAYS, overdueTaskMatch, dueSoonTaskMatch, isOverdue, isDueSoon };
