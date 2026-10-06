/**
 * Task DTO + per-actor permissions, shared by /staff/tasks and /staff/cases/:id/tasks.
 *
 * One function decides what an actor may do with a task, and the same function
 * feeds both the `actions` flags the UI renders and the checks the mutation
 * routes enforce, so the two cannot drift. Rules (ownership-scoped, never blanket):
 *  - tasks.manage (+ membership of the task's case unless cases.view_all): edit, status, assign
 *  - the assignee (+ cases.view and case membership for a case task): edit and status only
 *  - nobody else; a case task the actor cannot see at all is concealed (404)
 */
const Task = require('../models/admin/Task');
const { memberCaseIds } = require('./casePolicy');
const { can } = require('../utils/permissions');

const id = (v) => (v ? String(v._id || v) : '');

/** Resolved once per request: membership lookups are per actor, not per task. */
async function taskActionContext(req) {
  const viewAll = can(req, 'cases.view_all');
  return { viewAll, caseIds: viewAll ? null : new Set((await memberCaseIds(req)).map(String)) };
}

function taskAccess(req, task, ctx) {
  const caseId = id(task.case);
  const member = !caseId || ctx.viewAll || ctx.caseIds.has(caseId);
  const canView = !caseId || (can(req, 'cases.view') && member);
  const manage = can(req, 'tasks.manage') && member;
  const own = canView && id(task.assignee) === String(req.staff._id);
  return { canView, canEdit: manage || own, canChangeStatus: manage || own, canAssign: manage };
}

function serializeTask(t, access) {
  return {
    id: t._id,
    title: t.title,
    type: t.type,
    description: t.description || '',
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate || null,
    completedAt: t.completedAt || null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    assignee: t.assignee ? { id: t.assignee._id, displayName: t.assignee.name || '' } : null,
    case: t.case ? { id: t.case._id, caseNumber: t.case.caseNumber, title: t.case.title } : null,
    lead: t.lead
      ? { id: t.lead._id, displayName: t.lead.name || t.lead.email }
      : null,
    actions: { canEdit: access.canEdit, canChangeStatus: access.canChangeStatus, canAssign: access.canAssign },
  };
}

const populated = (query) =>
  query.populate('assignee', 'name').populate('case', 'caseNumber title').populate('lead', 'name email');

/** Re-reads a task with its relations and serializes it for this actor. */
async function loadTaskDto(req, taskId, ctx) {
  const task = await populated(Task.findById(taskId)).lean();
  if (!task) return null;
  return serializeTask(task, taskAccess(req, task, ctx || (await taskActionContext(req))));
}

/**
 * Which tasks an actor may see, as a Mongo filter. One definition for the Tasks list and for Staff search so they cannot
 * drift: tasks of cases the actor cannot see never appear (removed members lose them at once); case tasks additionally need
 * `cases.view` (the same rule taskAccess applies to a single task); team-wide visibility needs `tasks.view_all`, otherwise
 * only the actor's own tasks.
 */
async function visibleTaskFilter(req, { all = false } = {}) {
  const filter = {};
  if (!(all && can(req, 'tasks.view_all'))) filter.assignee = req.staff._id;
  if (!can(req, 'cases.view')) filter.case = null;
  else if (!can(req, 'cases.view_all')) filter.$or = [{ case: null }, { case: { $in: await memberCaseIds(req) } }];
  return filter;
}

module.exports = { visibleTaskFilter, taskActionContext, taskAccess, serializeTask, loadTaskDto, populated };
