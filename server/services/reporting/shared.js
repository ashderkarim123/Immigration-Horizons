/** Small helpers shared by the report sections. */
const AdminUser = require('../../models/admin/User');
const ClientCase = require('../../models/ClientCase');
const T = require('../../utils/calendarTime');
const { can } = require('../../utils/permissions');

/** Names for a set of employee ids in one query; a missing account is labelled, never dropped. */
async function employeeNames(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const users = await AdminUser.find({ _id: { $in: unique } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name || 'Unnamed employee']));
}

/** Case number/title for a set of case ids in one query. */
async function caseLabels(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const cases = await ClientCase.find({ _id: { $in: unique } }).select('caseNumber title').lean();
  return new Map(cases.map((c) => [String(c._id), { caseNumber: c.caseNumber, title: c.title }]));
}

/**
 * Open case-native tasks inside the report's case scope. Team-wide counts need `tasks.view_all` (as the Tasks module does);
 * everyone else is limited to their own tasks.
 */
function taskScope(req, ctx) {
  return { ...ctx.caseCond('case'), status: { $ne: 'completed' }, ...(can(req, 'tasks.view_all') ? {} : { assignee: req.staff._id }) };
}

const overdueTask = (ctx) => ({ dueDate: { $ne: null, $lt: ctx.todayUtc } });
/** Due today through the next N calendar days (inclusive), as date-only values. */
const dueWithin = (ctx, days) => ({ dueDate: { $gte: ctx.todayUtc, $lt: T.dateStringToUtc(T.addDays(ctx.today, days + 1)) } });

module.exports = { employeeNames, caseLabels, taskScope, overdueTask, dueWithin };
