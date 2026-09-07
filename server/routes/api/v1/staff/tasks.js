const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Task = require('../../../../models/admin/Task');
const { staffAuthMiddleware, requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { canManageTask } = require('../../../../services/casePolicy');
const { updateTask, changeTaskStatus, assignTask } = require('../../../../services/taskManagement');
const { can } = require('../../../../utils/permissions');
const { createApiError } = require('../../../../middleware/api/apiError');
const { loadCaseAndWorkspace } = require('../../../../services/caseManagement');

function serializeTaskSummary(t) {
  return {
    id: t._id,
    title: t.title,
    type: t.type,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate || null,
    assignee: t.assignee
      ? { id: t.assignee._id, displayName: t.assignee.name || '' }
      : null,
    case: t.case
      ? { id: t.case._id, caseNumber: t.case.caseNumber, title: t.case.title }
      : null,
    lead: t.lead
      ? { id: t.lead._id, displayName: [t.lead.firstName, t.lead.lastName].filter(Boolean).join(' ') || t.lead.email }
      : null,
    updatedAt: t.updatedAt,
  };
}

function serializeTaskDetail(t) {
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
    assignee: t.assignee
      ? { id: t.assignee._id, displayName: t.assignee.name || '' }
      : null,
    case: t.case
      ? { id: t.case._id, caseNumber: t.case.caseNumber, title: t.case.title }
      : null,
    lead: t.lead
      ? { id: t.lead._id, displayName: [t.lead.firstName, t.lead.lastName].filter(Boolean).join(' ') || t.lead.email }
      : null,
  };
}

// GET /api/v1/staff/tasks
router.get('/', staffAuthMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const query = {};

    // Scope filter (mine is default)
    const scope = req.query.scope || 'mine';
    if (scope === 'mine') {
      query.assignee = req.staff._id;
    } else if (scope === 'all') {
      if (!can(req, 'tasks.view_all')) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability.'));
      }
    } else if (scope === 'team') {
      // In a real team implementation, we would query by team IDs. Not in Phase 04.
      return next(createApiError(400, 'validation_error', 'Scope not implemented yet.'));
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
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = new RegExp(escaped, 'i');
    }

    // Phase 04: filter out tasks for inaccessible cases.
    // If scope !== 'mine' (e.g., 'all'), we must still restrict case access if we don't have cases.view_all.
    // But since only tasks.view_all allows 'all', and usually admins have both, we enforce case restriction
    // if `cases.view_all` is false.
    if (!can(req, 'cases.view_all')) {
      const { memberCaseIds } = require('../../../../services/casePolicy');
      const caseIds = await memberCaseIds(req);
      query.$or = [
        { case: null },
        { case: { $in: caseIds } }
      ];
    }

    const [items, total] = await Promise.all([
      Task.find(query)
        .populate('assignee', 'name')
        .populate('case', 'caseNumber title')
        .populate('lead', 'firstName lastName email')
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(query)
    ]);

    res.json({
      data: {
        items: items.map(serializeTaskSummary),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        pageSize: limit
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/staff/tasks/:id
router.get('/:id', staffAuthMiddleware, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(createApiError(404, 'not_found', 'Task not found.'));
    }

    const task = await Task.findById(req.params.id)
      .populate('assignee', 'name')
      .populate('case', 'caseNumber title')
      .populate('lead', 'firstName lastName email')
      .lean();

    if (!task) return next(createApiError(404, 'not_found', 'Task not found.'));

    if (task.case) {
      const context = await loadCaseAndWorkspace(task.case._id);
      if (!context) return next(createApiError(404, 'not_found', 'Task not found.'));
      const hasAccess = await canManageTask(req, context.workspace._id);
      
      // Access allowed if they have task capabilities or if they are assigned to it (existing rule).
      const { isTaskOwner } = require('../../../../middleware/api/staffAuth'); // existing checks?
      // Wait, canManageTask checks capabilities AND case membership.
      // If they are assignee, can they see it without membership? No, ADR-017 says removed employees lose access immediately.
      // So hasAccess determines visibility.
      // Let's rely on casePolicy:
      const { canViewCase } = require('../../../../services/casePolicy');
      const canView = await canViewCase(req, context.workspace._id);
      if (!canView) return next(createApiError(404, 'not_found', 'Task not found.'));
    }

    res.json({ data: serializeTaskDetail(task), meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/staff/tasks/:id
router.patch('/:id', staffAuthMiddleware, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(createApiError(404, 'not_found', 'Task not found.'));
    }

    const task = await Task.findById(req.params.id);
    if (!task) return next(createApiError(404, 'not_found', 'Task not found.'));

    let caseDoc, workspace;
    if (task.case) {
      const context = await loadCaseAndWorkspace(task.case);
      if (!context) return next(createApiError(404, 'not_found', 'Task not found.'));
      caseDoc = context.caseDoc;
      workspace = context.workspace;

      const { canManageTask } = require('../../../../services/casePolicy');
      const canManage = await canManageTask(req, workspace._id);
      const isAssignee = String(task.assignee) === String(req.staff._id);
      
      if (!canManage && !isAssignee) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability to manage this task.'));
      }
    } else {
      // Legacy lead task - use basic staffAuth rules
      const { getRole, can } = require('../../../../utils/permissions');
      const isAssignee = String(task.assignee) === String(req.staff._id);
      if (!can(req, 'tasks.manage') && !isAssignee) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability.'));
      }
    }

    const result = await updateTask({ task, caseDoc, workspace, updates: req.body, actor: req.staff });
    if (result.outcome === 'validation_error') {
      return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid update.', fields: result.errors } });
    }

    res.json({ data: { id: task._id }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/staff/tasks/:id/status
router.patch('/:id/status', staffAuthMiddleware, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(createApiError(404, 'not_found', 'Task not found.'));
    }

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: { code: 'validation_error', message: 'Status is required.' } });

    const task = await Task.findById(req.params.id);
    if (!task) return next(createApiError(404, 'not_found', 'Task not found.'));

    let caseDoc, workspace;
    if (task.case) {
      const context = await loadCaseAndWorkspace(task.case);
      if (!context) return next(createApiError(404, 'not_found', 'Task not found.'));
      caseDoc = context.caseDoc;
      workspace = context.workspace;

      const { canManageTask } = require('../../../../services/casePolicy');
      const canManage = await canManageTask(req, workspace._id);
      const isAssignee = String(task.assignee) === String(req.staff._id);
      if (!canManage && !isAssignee) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability to change status.'));
      }
    } else {
      const { can } = require('../../../../utils/permissions');
      const isAssignee = String(task.assignee) === String(req.staff._id);
      if (!can(req, 'tasks.manage') && !isAssignee) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability.'));
      }
    }

    const result = await changeTaskStatus({ task, caseDoc, workspace, newStatus: status, actor: req.staff });
    if (result.outcome === 'validation_error') {
      return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid status update.', fields: result.errors } });
    }

    res.json({ data: { id: task._id }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/staff/tasks/:id/assignee
router.patch('/:id/assignee', staffAuthMiddleware, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return next(createApiError(404, 'not_found', 'Task not found.'));
    }

    const { assignee } = req.body; // can be null to unassign

    const task = await Task.findById(req.params.id);
    if (!task) return next(createApiError(404, 'not_found', 'Task not found.'));

    let caseDoc, workspace;
    if (task.case) {
      const context = await loadCaseAndWorkspace(task.case);
      if (!context) return next(createApiError(404, 'not_found', 'Task not found.'));
      caseDoc = context.caseDoc;
      workspace = context.workspace;

      const { canAssignTask } = require('../../../../services/casePolicy');
      const canAssign = await canAssignTask(req, workspace._id);
      if (!canAssign) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability to assign task.'));
      }
    } else {
      const { can } = require('../../../../utils/permissions');
      if (!can(req, 'tasks.manage')) {
        return next(createApiError(403, 'forbidden', 'Insufficient capability.'));
      }
    }

    const result = await assignTask({ task, caseDoc, workspace, newAssigneeId: assignee, actor: req.staff });
    if (result.outcome === 'validation_error') {
      return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid assignment.', fields: result.errors } });
    }

    res.json({ data: { id: task._id }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
