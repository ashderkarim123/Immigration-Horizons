const express = require('express');
const router = express.Router();

const Task = require('../../../../models/admin/Task');
const { staffAuthMiddleware, requireApiCapability } = require('../../../../middleware/api/staffAuth');

// GET /api/v1/staff/tasks
router.get('/', staffAuthMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const query = { assignee: req.staff._id };

    if (req.query.status) {
      query.status = req.query.status;
    }

    const [items, total] = await Promise.all([
      Task.find(query)
        .select('title type status priority dueDate lead description createdAt')
        .populate('lead', 'name email')
        .sort({ dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(query)
    ]);

    res.json({
      data: {
        items,
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

module.exports = router;
