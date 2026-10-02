/**
 * Staff API: tasks. Permissions come from services/taskDto.js (the same function
 * that produces the UI's `actions` flags), so what the UI offers and what the
 * server enforces are one rule. A case task the actor cannot see is a plain 404;
 * visible but not permitted is 403. Mutations answer with the refreshed task DTO.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Task = require('../../../../models/admin/Task');
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { updateTask, changeTaskStatus, assignTask } = require('../../../../services/taskManagement');
const { taskActionContext, taskAccess, serializeTask, loadTaskDto, populated } = require('../../../../services/taskDto');
const { memberCaseIds } = require('../../../../services/casePolicy');
const { can } = require('../../../../utils/permissions');
const { createApiError } = require('../../../../middleware/api/apiError');
const { loadCaseAndWorkspace } = require('../../../../services/caseManagement');

const notFound = () => createApiError(404, 'not_found', 'Task not found.');
const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};
const toFieldErrors = (errors) => Object.entries(errors).map(([field, message]) => ({ field, message }));

// GET /api/v1/staff/tasks
router.get('/', staffAuthMiddleware, route(async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
  const query = {};

  const scope = req.query.scope || 'mine';
  if (scope === 'mine') {
    query.assignee = req.staff._id;
  } else if (scope === 'all') {
    if (!can(req, 'tasks.view_all')) return next(createApiError(403, 'forbidden', 'Insufficient capability.'));
  } else {
    return next(createApiError(400, 'validation_error', 'Unknown scope.'));
  }

  if (req.query.status) query.status = req.query.status;
  if (req.query.priority) query.priority = req.query.priority;
  if (req.query.type) query.type = req.query.type;

  if (req.query.due === 'overdue') {
    query.dueDate = { $ne: null, $lt: new Date() };
    query.status = { $ne: 'completed' };
  } else if (req.query.due === 'upcoming') {
    query.dueDate = { $ne: null, $gte: new Date() };
    query.status = { $ne: 'completed' };
  }

  if (req.query.search) {
    query.title = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  // Tasks of cases the actor is not a member of never appear (removed members lose access at once).
  if (!can(req, 'cases.view_all')) {
    query.$or = [{ case: null }, { case: { $in: await memberCaseIds(req) } }];
  }

  const ctx = await taskActionContext(req);
  const [items, total] = await Promise.all([
    populated(Task.find(query).sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
    Task.countDocuments(query),
  ]);

  res.json({
    data: {
      items: items.map((t) => serializeTask(t, taskAccess(req, t, ctx))),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      pageSize: limit,
    },
    meta: { requestId: req.id },
  });
}));

/** Loads the task into req.task (with its case context) or answers the one 404. */
const taskParam = route(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next(notFound());
  const task = await Task.findById(req.params.id);
  if (!task) return next(notFound());

  req.taskCtx = await taskActionContext(req);
  req.taskAccess = taskAccess(req, task, req.taskCtx);
  if (!req.taskAccess.canView) return next(notFound());

  if (task.case) {
    const context = await loadCaseAndWorkspace(task.case);
    if (!context) return next(notFound());
    req.taskCase = context;
  }
  req.task = task;
  return next();
});

const allow = (flag) => (req, res, next) =>
  req.taskAccess[flag] ? next() : next(createApiError(403, 'forbidden', 'Insufficient capability.'));

/** Runs a service call and answers with the refreshed DTO. */
const mutation = (flag, call) => [
  trustedOriginMiddleware,
  staffAuthMiddleware,
  taskParam,
  allow(flag),
  route(async (req, res, next) => {
    const result = await call(req, { task: req.task, caseDoc: req.taskCase && req.taskCase.caseDoc, workspace: req.taskCase && req.taskCase.workspace, actor: req.staff });
    if (result.outcome === 'validation_error') {
      return next(createApiError(422, 'validation_error', 'Please correct the highlighted fields.', toFieldErrors(result.errors)));
    }
    res.json({ data: await loadTaskDto(req, req.task._id), meta: { requestId: req.id } });
  }),
];

// GET /api/v1/staff/tasks/:id
router.get('/:id', staffAuthMiddleware, taskParam, route(async (req, res) => {
  res.json({ data: await loadTaskDto(req, req.task._id, req.taskCtx), meta: { requestId: req.id } });
}));

// PATCH /api/v1/staff/tasks/:id
router.patch('/:id', ...mutation('canEdit', (req, base) => updateTask({ ...base, updates: req.body || {} })));

// PATCH /api/v1/staff/tasks/:id/status
router.patch('/:id/status', ...mutation('canChangeStatus', (req, base) => changeTaskStatus({ ...base, newStatus: (req.body || {}).status })));

// PATCH /api/v1/staff/tasks/:id/assignee   (null unassigns)
router.patch('/:id/assignee', ...mutation('canAssign', async (req, base) => {
  const body = req.body || {};
  if (body.assignee === undefined) return { outcome: 'validation_error', errors: { assignee: 'Assignee is required (null unassigns).' } };
  return assignTask({ ...base, newAssigneeId: body.assignee });
}));

module.exports = router;
