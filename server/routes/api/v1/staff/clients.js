const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const ClientUser = require('../../../../models/ClientUser');
const ClientCase = require('../../../../models/ClientCase');

const { staffAuthMiddleware, requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');

// GET /api/v1/staff/clients
router.get('/', staffAuthMiddleware, requireApiCapability('clients.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.search) {
      const pattern = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: pattern }, { email: pattern }];
    }
    if (req.query.status) {
      query.status = req.query.status;
    } else {
      query.status = { $ne: 'archived' };
    }

    const [items, total] = await Promise.all([
      ClientUser.find(query)
        .select('name email phone status portalStatus createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ClientUser.countDocuments(query)
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

// GET /api/v1/staff/clients/:id
router.get('/:id', staffAuthMiddleware, requireApiCapability('clients.view'), async (req, res, next) => {
  try {
    const clientId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return next(createApiError(404, 'not_found', 'Client not found'));
    }

    const client = await ClientUser.findById(clientId).lean();
    if (!client || client.status === 'archived') {
      return next(createApiError(404, 'not_found', 'Client not found'));
    }

    const cases = await ClientCase.find({ primaryClient: clientId })
      .select('caseNumber title caseType currentStage priority targetFilingDate archivedAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      data: {
        ...client,
        cases
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
