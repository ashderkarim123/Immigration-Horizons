const express = require('express');
const router = express.Router();

const ClientCase = require('../../../../models/ClientCase');
const Task = require('../../../../models/admin/Task');
const { staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');
const { accessibleCaseIdFilter, memberCaseIds } = require('../../../../services/casePolicy');
const { can } = require('../../../../utils/permissions');

// GET /api/v1/staff/deadlines
router.get('/', staffAuthMiddleware, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueFilter = req.query.due || 'all'; // 'overdue', 'upcoming', 'all'
    const scope = req.query.scope || 'mine'; // 'mine', 'all'

    let caseFilter = {};
    if (scope === 'mine' || !can(req, 'cases.view_all')) {
      const ids = await memberCaseIds(req);
      caseFilter = { _id: { $in: ids } };
    }

    // 1. Fetch case target filing dates
    let caseQuery = { ...caseFilter, archivedAt: null, targetFilingDate: { $ne: null } };
    if (dueFilter === 'overdue') {
      caseQuery.targetFilingDate = { ...caseQuery.targetFilingDate, $lt: today };
    } else if (dueFilter === 'upcoming') {
      caseQuery.targetFilingDate = { ...caseQuery.targetFilingDate, $gte: today };
    }

    const casesWithDeadlines = await ClientCase.find(caseQuery)
      .select('caseNumber title targetFilingDate')
      .lean();

    // 2. Fetch task due dates
    let taskQuery = { status: { $ne: 'completed' }, dueDate: { $ne: null } };
    if (scope === 'mine') {
      taskQuery.assignee = req.staff._id;
    } else if (scope === 'all' && !can(req, 'tasks.view_all')) {
      // Must fall back to 'mine' if they don't have tasks.view_all
      taskQuery.assignee = req.staff._id;
    }

    if (!can(req, 'cases.view_all')) {
      const ids = await memberCaseIds(req);
      taskQuery.$or = [{ case: null }, { case: { $in: ids } }];
    }

    if (dueFilter === 'overdue') {
      taskQuery.dueDate = { ...taskQuery.dueDate, $lt: today };
    } else if (dueFilter === 'upcoming') {
      taskQuery.dueDate = { ...taskQuery.dueDate, $gte: today };
    }

    const tasksWithDeadlines = await Task.find(taskQuery)
      .populate('case', 'caseNumber title')
      .populate('assignee', 'name')
      .select('title dueDate case assignee')
      .lean();

    // Combine and sort
    const deadlines = [];

    for (const c of casesWithDeadlines) {
      deadlines.push({
        id: `case_${c._id}`,
        type: 'case_target_filing',
        date: c.targetFilingDate,
        title: c.title,
        case: { id: c._id, caseNumber: c.caseNumber, title: c.title },
        task: null
      });
    }

    for (const t of tasksWithDeadlines) {
      deadlines.push({
        id: `task_${t._id}`,
        type: 'task_due',
        date: t.dueDate,
        title: t.title,
        case: t.case ? { id: t.case._id, caseNumber: t.case.caseNumber, title: t.case.title } : null,
        task: { id: t._id, title: t.title, assignee: t.assignee ? { id: t.assignee._id, displayName: t.assignee.name } : null }
      });
    }

    deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      data: { deadlines },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
