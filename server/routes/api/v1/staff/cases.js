/**
 * Staff API: case directory and case detail.
 *
 * Security:
 * - Cases require cases.view capability plus row-level membership for non-view_all roles
 * - Case concealment: malformed/nonexistent/inaccessible all return 404 (no existence oracle)
 * - Case detail uses CaseActivity (not ActivityLog)
 * - DTOs are explicit — no raw .lean() spread
 * - Client population uses firstName + lastName (not name)
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const ClientCase = require('../../../../models/ClientCase');
const CaseWorkspace = require('../../../../models/CaseWorkspace');
const CaseDocument = require('../../../../models/CaseDocument');
const CaseActivity = require('../../../../models/CaseActivity');
const WorkspaceMember = require('../../../../models/WorkspaceMember');
const AdminUser = require('../../../../models/admin/User');

// staffAuthMiddleware + requirePasswordSetupComplete applied by staff/index.js
const { requireApiCapability, staffAuthMiddleware } = require('../../../../middleware/api/staffAuth');
const {
  accessibleCaseIdFilter,
  memberCaseIds,
  canViewCase,
  canManageCase,
  canAssignCase,
  canArchiveCase,
  canManageWorkspaceMembers,
} = require('../../../../services/casePolicy');
const { can } = require('../../../../utils/permissions');
const { createApiError } = require('../../../../middleware/api/apiError');

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeCaseListItem(c) {
  const pm = c.projectManager;
  const client = c.primaryClient;
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
    projectManager: pm
      ? { id: pm._id, name: pm.name || '', avatar: pm.avatar || null }
      : null,
    primaryClient: client
      ? {
          id: client._id,
          displayName: [client.firstName || '', client.lastName || ''].filter(Boolean).join(' ') || client.email,
          email: client.email,
        }
      : null,
  };
}

function serializeCaseDetail(c) {
  const pm = c.projectManager;
  const client = c.primaryClient;
  return {
    id: c._id,
    caseNumber: c.caseNumber,
    title: c.title,
    caseType: c.caseType,
    currentStage: c.currentStage,
    priority: c.priority,
    targetFilingDate: c.targetFilingDate || null,
    archivedAt: c.archivedAt || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    projectManager: pm
      ? { id: pm._id, name: pm.name || '', avatar: pm.avatar || null }
      : null,
    primaryClient: client
      ? {
          id: client._id,
          displayName: [client.firstName || '', client.lastName || ''].filter(Boolean).join(' ') || client.email,
          firstName: client.firstName || '',
          lastName: client.lastName || '',
          email: client.email,
        }
      : null,
  };
}

function serializeMember(m) {
  const emp = m.adminUser;
  const cli = m.clientUser;
  return {
    id: m._id,
    memberType: m.memberType,
    workspaceRole: m.workspaceRole,
    status: m.status,
    clientVisible: m.clientVisible,
    joinedAt: m.createdAt,
    employee: emp
      ? {
          id: emp._id,
          name: emp.name || '',
          email: emp.email || '',
          role: emp.role || '',
          avatar: emp.avatar || null,
          jobTitle: emp.jobTitle || '',
          department: emp.department || '',
        }
      : null,
    client: cli
      ? {
          id: cli._id,
          displayName: [cli.firstName || '', cli.lastName || ''].filter(Boolean).join(' ') || cli.email,
          email: cli.email,
        }
      : null,
  };
}

function serializeDocument(d) {
  return {
    id: d._id,
    displayName: d.displayName || d.originalName || '',
    status: d.status,
    category: d.category ? (d.category.name || d.category) : null,
    uploadedAt: d.uploadedAt || d.createdAt,
    size: d.size || null,
    scanStatus: d.scanStatus || null,
  };
}

function serializeActivity(a) {
  return {
    id: a._id,
    type: a.type,
    message: a.message,
    actorName: a.actorName || 'System',
    createdAt: a.createdAt,
    meta: a.meta || null,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/v1/staff/cases
// staffAuth + requirePasswordSetupComplete already applied by parent router
router.get('/', requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const showArchived = req.query.archived === 'true';
    const query = showArchived ? {} : { archivedAt: null };

    if (req.query.stage) query.currentStage = req.query.stage;
    if (req.query.caseType) query.caseType = req.query.caseType;
    if (req.query.priority) query.priority = req.query.priority;

    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      query.$or = [{ caseNumber: pattern }, { title: pattern }];
    }

    if (req.query.scope === 'unassigned') {
      query.$and = [
        ...(query.$and || []),
        { $or: [{ projectManager: null }, { projectManager: { $exists: false } }] },
      ];
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
        .select('caseNumber title caseType currentStage priority targetFilingDate projectManager primaryClient updatedAt archivedAt createdAt')
        .populate('projectManager', 'name avatar')
        .populate('primaryClient', 'firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ClientCase.countDocuments(query),
    ]);

    res.json({
      data: {
        items: items.map(serializeCaseListItem),
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

// GET /api/v1/staff/cases/:id
router.get('/:id', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const caseId = req.params.id;

    // Malformed ID → same 404 as nonexistent (no existence oracle)
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const caseDoc = await ClientCase.findById(caseId)
      .populate('primaryClient', 'firstName lastName email')
      .populate('projectManager', 'name avatar')
      .lean();

    if (!caseDoc) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const workspace = await CaseWorkspace.findOne({ case: caseId, workspaceType: 'primary' }).lean();
    if (!workspace) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    // Inaccessible case → same 404, not 403 (concealment rule A14)
    const hasAccess = await canViewCase(req, workspace._id);
    if (!hasAccess) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    // Compute server-side action flags for the UI
    const [canManage, canAssign, canArchive, canManageMembers] = await Promise.all([
      canManageCase(req, workspace._id),
      canAssignCase(req, workspace._id),
      canArchiveCase(req, workspace._id),
      canManageWorkspaceMembers(req, workspace._id),
    ]);
    const canPublishClientUpdate = can(req, 'client_updates.publish') &&
      (can(req, 'cases.view_all') || await canViewCase(req, workspace._id));

    res.json({
      data: {
        ...serializeCaseDetail(caseDoc),
        workspaceId: workspace._id,
        actions: {
          canManageCase: canManage,
          canAssignManager: canAssign,
          canArchive,
          canManageMembers,
          canPublishClientUpdate,
        },
      },
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/staff/cases/:id/members
router.get('/:id/members', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const caseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const workspace = await CaseWorkspace.findOne({ case: caseId, workspaceType: 'primary' }).lean();
    if (!workspace) return next(createApiError(404, 'not_found', 'Case not found.'));

    const hasAccess = await canViewCase(req, workspace._id);
    if (!hasAccess) return next(createApiError(404, 'not_found', 'Case not found.'));

    const members = await WorkspaceMember.find({ workspace: workspace._id })
      .populate('adminUser', 'name email role avatar jobTitle department')
      .populate('clientUser', 'firstName lastName email')
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      data: { members: members.map(serializeMember) },
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/staff/cases/:id/activity
router.get('/:id/activity', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const caseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const workspace = await CaseWorkspace.findOne({ case: caseId, workspaceType: 'primary' }).lean();
    if (!workspace) return next(createApiError(404, 'not_found', 'Case not found.'));

    const hasAccess = await canViewCase(req, workspace._id);
    if (!hasAccess) return next(createApiError(404, 'not_found', 'Case not found.'));

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const [activity, total] = await Promise.all([
      CaseActivity.find({ case: caseId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CaseActivity.countDocuments({ case: caseId }),
    ]);

    res.json({
      data: {
        items: activity.map(serializeActivity),
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

// GET /api/v1/staff/cases/:id/member-options (Gate B — candidate employees)
router.get('/:id/member-options', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const caseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const workspace = await CaseWorkspace.findOne({ case: caseId, workspaceType: 'primary' }).lean();
    if (!workspace) return next(createApiError(404, 'not_found', 'Case not found.'));

    const hasManage = await canManageWorkspaceMembers(req, workspace._id);
    const hasAssign = await canAssignCase(req, workspace._id);
    if (!hasManage && !hasAssign) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    // Only return active employees — no password/lockout/session fields
    const employees = await AdminUser.find({ isActive: true })
      .select('name email role jobTitle department avatar')
      .sort({ name: 1 })
      .lean();

    res.json({
      data: {
        employees: employees.map((e) => ({
          id: e._id,
          name: e.name || '',
          email: e.email || '',
          role: e.role || '',
          jobTitle: e.jobTitle || '',
          department: e.department || '',
          avatar: e.avatar || null,
        })),
      },
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/staff/cases/:id/tasks
router.get('/:id/tasks', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const caseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const workspace = await CaseWorkspace.findOne({ case: caseId, workspaceType: 'primary' }).lean();
    if (!workspace) return next(createApiError(404, 'not_found', 'Case not found.'));

    const hasAccess = await canViewCase(req, workspace._id);
    if (!hasAccess) return next(createApiError(404, 'not_found', 'Case not found.'));

    const Task = require('../../../../models/admin/Task');
    const tasks = await Task.find({ case: caseId })
      .populate('assignee', 'name')
      .populate('case', 'caseNumber title')
      .populate('lead', 'firstName lastName email')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    // serializeTaskSummary from tasks.js logic
    const serializeTaskSummary = (t) => ({
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
    });

    res.json({
      data: { tasks: tasks.map(serializeTaskSummary) },
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/staff/cases/:id/tasks
router.post('/:id/tasks', staffAuthMiddleware, requireApiCapability('cases.view'), async (req, res, next) => {
  try {
    const caseId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return next(createApiError(404, 'not_found', 'Case not found.'));
    }

    const { loadCaseAndWorkspace } = require('../../../../services/caseManagement');
    const context = await loadCaseAndWorkspace(caseId);
    if (!context) return next(createApiError(404, 'not_found', 'Case not found.'));

    const { canManageTask } = require('../../../../services/casePolicy');
    const hasAccess = await canManageTask(req, context.workspace._id);
    if (!hasAccess) return next(createApiError(403, 'forbidden', 'Insufficient capability.'));

    const { title, type, priority, dueDate, assignee, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: { code: 'validation_error', message: 'Title is required.' } });
    }

    const { createCaseTask } = require('../../../../services/taskManagement');
    const result = await createCaseTask({
      caseDoc: context.caseDoc,
      workspace: context.workspace,
      taskData: { title, type, priority, dueDate, assignee, description },
      actor: req.staff,
    });

    if (result.outcome === 'validation_error') {
      return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid task.', fields: result.errors } });
    }

    res.json({ data: { id: result.task._id }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
