/**
 * Staff API: client directory and client detail.
 *
 * Security:
 * - Requires clients.view capability
 * - Client list: org-wide directory for roles holding clients.view
 * - Client detail: case-scoped panels are intersected with the actor's
 *   authorized case IDs so a PM cannot discover another team's cases
 *   through a shared client record
 * - passwordHash and all credential/lockout fields are NEVER returned
 * - ClientUser.name does not exist — derive displayName from firstName + lastName
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const ClientUser = require('../../../../models/ClientUser');
const ClientCase = require('../../../../models/ClientCase');

// staffAuthMiddleware + requirePasswordSetupComplete applied by staff/index.js
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const { accessibleCaseIdFilter } = require('../../../../services/casePolicy');

/**
 * Derives a display name from a ClientUser lean object.
 * Uses firstName + lastName, falling back to email.
 */
function deriveDisplayName(c) {
  const parts = [c.firstName || '', c.lastName || ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : (c.email || '');
}

/**
 * Serializes a ClientUser for the list view.
 * Never exposes password, lockout counters, or internal auth fields.
 */
function serializeClientListItem(c, caseCount) {
  return {
    id: c._id,
    displayName: deriveDisplayName(c),
    firstName: c.firstName || '',
    lastName: c.lastName || '',
    email: c.email,
    status: c.status,
    caseCount: caseCount !== undefined ? caseCount : 0,
    lastLoginAt: c.lastLoginAt || null,
    createdAt: c.createdAt,
  };
}

/**
 * Serializes a ClientUser for the detail view.
 * Includes limited operational state but never credentials.
 */
function serializeClientDetail(c) {
  return {
    id: c._id,
    displayName: deriveDisplayName(c),
    firstName: c.firstName || '',
    lastName: c.lastName || '',
    email: c.email,
    phone: c.phone || '',
    status: c.status,
    // Operational state (no credential value exposed):
    lockedUntil: c.lockedUntil || null,
    lastLoginAt: c.lastLoginAt || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Serializes a ClientCase for inclusion in client detail panels.
 */
function serializeCaseForClientDetail(c) {
  return {
    id: c._id,
    caseNumber: c.caseNumber,
    title: c.title,
    caseType: c.caseType,
    currentStage: c.currentStage,
    priority: c.priority,
    targetFilingDate: c.targetFilingDate || null,
    archivedAt: c.archivedAt || null,
    updatedAt: c.updatedAt,
  };
}

// GET /api/v1/staff/clients
// staffAuth + requirePasswordSetupComplete already applied by parent router
router.get('/', requireApiCapability('clients.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.search) {
      // Escape regex metacharacters — never execute arbitrary regex
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      query.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { email: pattern },
      ];
    }

    if (req.query.status) {
      query.status = req.query.status;
    } else {
      // Default: exclude disabled accounts
      query.status = { $ne: 'disabled' };
    }

    const [items, total] = await Promise.all([
      ClientUser.find(query)
        .select('firstName lastName email status lastLoginAt createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ClientUser.countDocuments(query),
    ]);

    // Get authorized case counts for each client
    const clientIds = items.map((c) => c._id);
    const restriction = await accessibleCaseIdFilter(req);

    const caseCountQuery = { primaryClient: { $in: clientIds } };
    if (restriction) {
      caseCountQuery._id = restriction._id;
    }

    const caseCounts = await ClientCase.aggregate([
      { $match: caseCountQuery },
      { $group: { _id: '$primaryClient', count: { $sum: 1 } } },
    ]);

    const countMap = Object.fromEntries(caseCounts.map((r) => [String(r._id), r.count]));

    res.json({
      data: {
        items: items.map((c) => serializeClientListItem(c, countMap[String(c._id)] || 0)),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        pageSize: limit,
      },
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/staff/clients/:id
router.get('/:id', requireApiCapability('clients.view'), async (req, res, next) => {
  try {
    const clientId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return next(createApiError(404, 'not_found', 'Client not found.'));
    }

    const client = await ClientUser.findById(clientId)
      .select('firstName lastName email phone status lockedUntil lastLoginAt createdAt updatedAt')
      .lean();

    if (!client || client.status === 'disabled') {
      return next(createApiError(404, 'not_found', 'Client not found.'));
    }

    // Case panel: intersect with the actor's authorized case IDs (A11)
    const restriction = await accessibleCaseIdFilter(req);
    const caseQuery = { primaryClient: clientId, archivedAt: null };
    if (restriction) {
      caseQuery._id = restriction._id;
    }

    const cases = await ClientCase.find(caseQuery)
      .select('caseNumber title caseType currentStage priority targetFilingDate archivedAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      data: {
        ...serializeClientDetail(client),
        // cases = null means no clients.view access; since we are behind clients.view
        // guard, we always return the array (empty if no authorized cases).
        cases: cases.map(serializeCaseForClientDetail),
      },
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
