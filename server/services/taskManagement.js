const mongoose = require('mongoose');

const Task = require('../models/admin/Task');
const CaseActivity = require('../models/CaseActivity');
const AdminUser = require('../models/admin/User');
const { hasActiveEmployeeMembership } = require('./casePolicy');
const { notify } = require('../utils/notify');

/**
 * Task Management Service
 * Handles canonical task business logic for Phase 04.
 */

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

/**
 * Validates and normalizes the editable task fields. `partial` (updates) only checks
 * the fields that are present; otherwise a title is required. Bad values are reported
 * here instead of surfacing as a Mongoose cast/enum error (a 500).
 */
function validateTaskFields(data, { partial = false } = {}) {
  const errors = {};
  const values = {};
  const has = (k) => data[k] !== undefined;

  if (has('title') || !partial) {
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) errors.title = 'Title is required.';
    else if (title.length > MAX_TITLE) errors.title = `Title must not exceed ${MAX_TITLE} characters.`;
    else values.title = title;
  }
  if (has('type')) {
    if (!Task.TYPES.includes(data.type)) errors.type = 'Invalid task type.';
    else values.type = data.type;
  }
  if (has('priority')) {
    if (!Task.PRIORITIES.includes(data.priority)) errors.priority = 'Invalid priority.';
    else values.priority = data.priority;
  }
  if (has('description')) {
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (description.length > MAX_DESCRIPTION) errors.description = `Description must not exceed ${MAX_DESCRIPTION} characters.`;
    else values.description = description;
  }
  if (has('dueDate')) {
    if (data.dueDate === null || data.dueDate === '') values.dueDate = null;
    else if (Number.isNaN(new Date(data.dueDate).getTime())) errors.dueDate = 'Invalid due date.';
    else values.dueDate = new Date(data.dueDate);
  }

  return Object.keys(errors).length ? { errors } : { values };
}

async function createCaseTask({ caseDoc, workspace, taskData, actor }) {
  const checked = validateTaskFields(taskData);
  if (checked.errors) return { outcome: 'validation_error', errors: checked.errors };
  taskData = { ...taskData, ...checked.values };

  if (taskData.assignee) {
    if (!mongoose.Types.ObjectId.isValid(taskData.assignee)) {
      return { outcome: 'validation_error', errors: { assignee: 'Invalid assignee ID.' } };
    }
    const assigneeUser = await AdminUser.findOne({ _id: taskData.assignee, isActive: true });
    if (!assigneeUser) {
      return { outcome: 'validation_error', errors: { assignee: 'Assignee must be an active employee.' } };
    }
    const isMember = await hasActiveEmployeeMembership({ staff: { _id: taskData.assignee } }, workspace._id);
    if (!isMember) {
      return { outcome: 'validation_error', errors: { assignee: 'Add this employee to the case team before assigning the task.' } };
    }
    taskData.assigneeName = assigneeUser.name;
  }

  const task = new Task({
    case: caseDoc._id,
    lead: caseDoc.consultation || null,
    title: taskData.title,
    type: taskData.type || 'Other',
    description: taskData.description || '',
    priority: taskData.priority || 'medium',
    status: 'todo', // moves through changeTaskStatus, never set on creation
    dueDate: taskData.dueDate || null,
    assignee: taskData.assignee || null,
    assigneeName: taskData.assigneeName || '',
    createdBy: actor.name,
  });

  await task.save();

  await CaseActivity.record({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    type: 'task_created',
    message: `Task "${task.title}" created by ${actor.name}.`,
    actor,
    meta: { taskId: task._id, assignee: task.assignee },
  });

  if (task.assignee && String(task.assignee) !== String(actor.id)) {
    await notify({
      recipientName: task.assigneeName,
      recipientAdminId: task.assignee,
      title: `Task assigned: ${caseDoc.caseNumber}`,
      message: `You were assigned task "${task.title}" on case "${caseDoc.title}".`,
      type: 'task_assigned',
      relatedCase: caseDoc._id,
    });
  }

  return { outcome: 'created', task };
}

async function updateTask({ task, caseDoc, workspace, updates, actor }) {
  const checked = validateTaskFields(updates, { partial: true });
  if (checked.errors) return { outcome: 'validation_error', errors: checked.errors };

  let hasChanges = false;
  let dueDateChanged = false;

  for (const [field, value] of Object.entries(checked.values)) {
    if (field === 'dueDate') {
      const oldDate = task.dueDate ? task.dueDate.toISOString() : null;
      if (oldDate !== (value ? value.toISOString() : null)) {
        task.dueDate = value;
        hasChanges = true;
        dueDateChanged = true;
      }
    } else if (task[field] !== value) {
      task[field] = value;
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return { outcome: 'unchanged', task };
  }

  await task.save();

  if (dueDateChanged && caseDoc && workspace) {
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: 'task_due_date_changed',
      message: `Due date updated on task "${task.title}" by ${actor.name}.`,
      actor,
      meta: { taskId: task._id, dueDate: task.dueDate },
    });
  }

  return { outcome: 'updated', task };
}

async function changeTaskStatus({ task, caseDoc, workspace, newStatus, actor }) {
  if (!Task.STATUSES.includes(newStatus)) {
    return { outcome: 'validation_error', errors: { status: 'Invalid status.' } };
  }
  if (task.status === newStatus) {
    return { outcome: 'unchanged', task };
  }

  const oldStatus = task.status;
  task.status = newStatus;
  await task.save(); // pre-save hook handles completedAt

  if (caseDoc && workspace) {
    const activityType = newStatus === 'completed' ? 'task_completed' : (oldStatus === 'completed' ? 'task_reopened' : 'task_status_changed');
    const messageAction = newStatus === 'completed' ? 'completed' : (oldStatus === 'completed' ? 'reopened' : `changed status to ${newStatus}`);
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: activityType,
      message: `Task "${task.title}" ${messageAction} by ${actor.name}.`,
      actor,
      meta: { taskId: task._id, oldStatus, newStatus },
    });
  }

  return { outcome: 'updated', task };
}

async function assignTask({ task, caseDoc, workspace, newAssigneeId, actor }) {
  if (newAssigneeId && !mongoose.Types.ObjectId.isValid(newAssigneeId)) {
    return { outcome: 'validation_error', errors: { assignee: 'Invalid assignee ID.' } };
  }

  if (String(task.assignee) === String(newAssigneeId)) {
    return { outcome: 'unchanged', task };
  }

  let newAssigneeName = '';

  if (newAssigneeId) {
    const assigneeUser = await AdminUser.findOne({ _id: newAssigneeId, isActive: true });
    if (!assigneeUser) {
      return { outcome: 'validation_error', errors: { assignee: 'Assignee must be an active employee.' } };
    }
    if (caseDoc && workspace) {
      const isMember = await hasActiveEmployeeMembership({ staff: { _id: newAssigneeId } }, workspace._id);
      if (!isMember) {
        return { outcome: 'validation_error', errors: { assignee: 'Add this employee to the case team before assigning the task.' } };
      }
    }
    newAssigneeName = assigneeUser.name;
  }

  task.assignee = newAssigneeId || null;
  task.assigneeName = newAssigneeName;
  await task.save();

  if (caseDoc && workspace) {
    await CaseActivity.record({
      caseId: caseDoc._id,
      workspaceId: workspace._id,
      type: 'task_assigned',
      message: `Task "${task.title}" assigned to ${newAssigneeName || 'unassigned'} by ${actor.name}.`,
      actor,
      meta: { taskId: task._id, assignee: task.assignee },
    });
  }

  if (task.assignee && String(task.assignee) !== String(actor.id) && caseDoc) {
    await notify({
      recipientName: task.assigneeName,
      recipientAdminId: task.assignee,
      title: `Task assigned: ${caseDoc.caseNumber}`,
      message: `You were assigned task "${task.title}" on case "${caseDoc.title}".`,
      type: 'task_assigned',
      relatedCase: caseDoc._id,
    });
  }

  return { outcome: 'updated', task };
}

module.exports = {
  createCaseTask,
  updateTask,
  changeTaskStatus,
  assignTask,
};
