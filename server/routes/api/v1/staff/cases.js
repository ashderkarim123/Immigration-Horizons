const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const ClientCase = require('../../../../models/ClientCase');
const CaseWorkspace = require('../../../../models/CaseWorkspace');
const CaseDocument = require('../../../../models/CaseDocument');
const WorkspaceMember = require('../../../../models/WorkspaceMember');
const ActivityLog = require('../../../../models/admin/ActivityLog');

const { staffAuthMiddleware, requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { accessibleCaseIdFilter, memberCaseIds, canViewCase } = require('../../../../services/casePolicy');
const { can } = require('../../../../utils/permissions');
const { createApiError } = require('../../../../middleware/api/apiError');

// GET /api/v1/staff/cases
router.get('/', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const query = { archivedAt: null };

    if (req.query.stage) query.currentStage = req.query.stage;
    if (req.query.caseType) query.caseType = req.query.caseType;
    if (req.query.priority) query.priority = req.query.priority;

    if (req.query.search) {
      const pattern = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ caseNumber: pattern }, { title: pattern }];
    }

    if (req.query.scope === 'unassigned') {
      query.projectManager = null;
    }

    const idSets = [];
    if (req.query.scope === 'mine') {
      idSets.push(await memberCaseIds(req));
    }

    const restriction = await accessibleCaseIdFilter(req);
    if (restriction) {
      idSets.push(restriction._id.$in);
    }

    if (idSets.length > 0) {
      const allowed = idSets.reduce((acc, nextArr) => {
        const set = new Set(nextArr.map(String));
        return acc.filter((id) => set.has(String(id)));
      });
      query._id = { $in: allowed };
    }

    const [items, total] = await Promise.all([
      ClientCase.find(query)
        .select('caseNumber title caseType currentStage priority targetFilingDate projectManager primaryClient updatedAt archivedAt')
        .populate('projectManager', 'name avatar')
        .populate('primaryClient', 'name email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ClientCase.countDocuments(query)
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

// GET /api/v1/staff/cases/:id
router.get('/:id', staffAuthMiddleware, async (req, res, next) => {
  try {
    const caseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found'));
    }

    const caseDoc = await ClientCase.findById(caseId)
      .populate('primaryClient', 'name email')
      .populate('projectManager', 'name avatar')
      .lean();

    if (!caseDoc || caseDoc.archivedAt) {
      return next(createApiError(404, 'not_found', 'Case not found'));
    }

    // Row-level auth check - the first time the workspace ID is needed
    // However, canViewCase expects the workspace ID, which we get from CaseWorkspace
    const workspace = await CaseWorkspace.findOne({ case: caseId }).lean();
    if (!workspace) {
      return next(createApiError(404, 'not_found', 'Workspace not found'));
    }

    const hasAccess = await canViewCase(req, workspace._id);
    if (!hasAccess) {
      return next(createApiError(403, 'forbidden', 'You do not have access to this case'));
    }

    // Fetch dependencies
    const [members, documents, activity] = await Promise.all([
      WorkspaceMember.find({ workspace: workspace._id, status: 'active' })
        .populate('adminUser', 'name email role avatar jobTitle department')
        .populate('clientUser', 'name email')
        .sort({ createdAt: 1 })
        .lean(),
      CaseDocument.find({ case: caseId, archivedAt: null })
        .select('title status category uploadedAt')
        .populate('category', 'name')
        .sort({ uploadedAt: -1 })
        .limit(10)
        .lean(),
      ActivityLog.find({ 'case': caseId }) // We might not have a strong link, but let's try
        .sort({ createdAt: -1 })
        .limit(10)
        .lean().catch(() => []) // fallback if ActivityLog doesn't have a case field
    ]);

    res.json({
      data: {
        ...caseDoc,
        workspaceId: workspace._id,
        team: members,
        recentDocuments: documents,
        recentActivity: activity
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
