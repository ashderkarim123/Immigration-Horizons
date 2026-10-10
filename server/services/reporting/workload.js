/**
 * Workload report (ADR-028): a SNAPSHOT of current open work per employee, inside the report's case scope. Open cases as project
 * manager, open tasks, overdue tasks, tasks due in the next 7 days; unassigned tasks and cases without a project manager are
 * counted separately. No utilization percentage (there is no capacity data), no score and no ranking: rows are alphabetical.
 * Other employees' rows need `tasks.view_all`, as in the Tasks module; everyone else sees their own row only.
 */
const ClientCase = require('../../models/ClientCase');
const Task = require('../../models/admin/Task');
const { can } = require('../../utils/permissions');
const { employeeNames, taskScope, overdueTask, dueWithin } = require('./shared');

async function run(req, ctx) {
  const everyone = can(req, 'tasks.view_all');
  const [caseRows, taskRows, unassigned, noManager] = await Promise.all([
    ClientCase.aggregate([{ $match: { ...ctx.activeCases, projectManager: { $ne: null } } }, { $group: { _id: '$projectManager', count: { $sum: 1 } } }]),
    Task.aggregate([
      { $match: { ...taskScope(req, ctx), assignee: { $ne: null } } },
      {
        $group: {
          _id: '$assignee',
          openTasks: { $sum: 1 },
          overdueTasks: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', ctx.todayUtc] }] }, 1, 0] } },
          dueSoonTasks: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $gte: ['$dueDate', dueWithin(ctx, 7).dueDate.$gte] }, { $lt: ['$dueDate', dueWithin(ctx, 7).dueDate.$lt] }] }, 1, 0] } },
        },
      },
    ]),
    everyone ? Task.countDocuments({ ...taskScope(req, ctx), assignee: null }) : null,
    ClientCase.countDocuments({ ...ctx.activeCases, projectManager: null }),
  ]);

  const byEmployee = new Map();
  const row = (id) => {
    if (!byEmployee.has(id)) byEmployee.set(id, { employeeId: id, openCases: 0, openTasks: 0, overdueTasks: 0, dueSoonTasks: 0 });
    return byEmployee.get(id);
  };
  for (const r of caseRows) row(String(r._id)).openCases = r.count;
  for (const r of taskRows) Object.assign(row(String(r._id)), { openTasks: r.openTasks, overdueTasks: r.overdueTasks, dueSoonTasks: r.dueSoonTasks });

  const names = await employeeNames([...byEmployee.keys()]);
  const me = String(req.staff._id);
  const rows = [...byEmployee.values()]
    .filter((r) => everyone || r.employeeId === me)
    .map((r) => ({ ...r, name: names.get(r.employeeId) || 'Former employee' }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.employeeId.localeCompare(b.employeeId));

  const data = {
    snapshot: {
      rows,
      unassignedTasks: unassigned,
      casesWithoutProjectManager: noManager,
      scopeNote: everyone ? 'All employees with open work in this scope.' : 'Your own open work. Team-wide workload needs task visibility for the whole team.',
    },
  };
  return { data, table: exportTable(data) };
}

function exportTable(data) {
  const rows = data.snapshot.rows.map((r) => ({ employee: r.name, openCases: r.openCases, openTasks: r.openTasks, overdueTasks: r.overdueTasks, dueSoonTasks: r.dueSoonTasks }));
  if (data.snapshot.unassignedTasks !== null) rows.push({ employee: 'Unassigned tasks', openCases: '', openTasks: data.snapshot.unassignedTasks, overdueTasks: '', dueSoonTasks: '' });
  rows.push({ employee: 'Cases without a project manager', openCases: data.snapshot.casesWithoutProjectManager, openTasks: '', overdueTasks: '', dueSoonTasks: '' });
  return {
    columns: [
      { key: 'employee', label: 'Employee' },
      { key: 'openCases', label: 'Open cases (as project manager)' },
      { key: 'openTasks', label: 'Open tasks' },
      { key: 'overdueTasks', label: 'Overdue tasks' },
      { key: 'dueSoonTasks', label: 'Tasks due within 7 days' },
    ],
    rows,
  };
}

module.exports = { run, exportTable };
