const mongoose = require('mongoose');

const Consultation = require('../../models/Consultation');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const CaseActivity = require('../../models/CaseActivity');
const WorkspaceMember = require('../../models/WorkspaceMember');
const ClientUser = require('../../models/ClientUser');
const AdminUser = require('../../models/admin/User');
const Task = require('../../models/admin/Task');

const { requireCapability, can } = require('../../utils/permissions');
const { actorFromSession } = require('../../utils/actorSnapshot');
const {
  CASE_TYPES,
  CASE_TYPE_VALUES,
  CASE_STAGES,
  CASE_STAGE_VALUES,
  WORKSPACE_ROLES,
} = require('../../utils/caseConstants');
const casePolicy = require('../../services/casePolicy');
const { convertConsultationToCase } = require('../../services/caseConversion');
const caseManagement = require('../../services/caseManagement');
const { emitClientUpdateMessage } = require('../../services/systemMessageService');
const { MAX_MESSAGE_BODY_LENGTH } = require('../../utils/collaborationConstants');

const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 20;

function parseBoundedInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeEnumParam(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : 'all';
}

/**
 * Attaches Cycle 2 case/workspace/membership routes onto the SAME router
 * instance used by routes/admin/index.js — same pattern as leadOps.js's
 * attachLeadOps, so these inherit the shared `requireAdmin` + session-locals
 * middleware rather than duplicating it.
 */
module.exports = function attachCases(router) {
  // ======================================================================
  // CASES LIST
  // ======================================================================

  router.get('/admin/cases', requireCapability('cases.view'), async (req, res) => {
    try {
      const stage = sanitizeEnumParam(req.query.stage, CASE_STAGE_VALUES.concat('all'));
      const projectManager = mongoose.Types.ObjectId.isValid(req.query.projectManager || '')
        ? req.query.projectManager
        : 'all';
      const archived = req.query.archived === '1';
      const page = parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
      const limit = parseBoundedInt(req.query.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);

      const filter = {};
      if (stage !== 'all') filter.currentStage = stage;
      if (projectManager !== 'all') filter.projectManager = projectManager;
      filter.archivedAt = archived ? { $ne: null } : null;

      // Row-level scoping for the list itself: without org-wide
      // `cases.view_all`, only cases the actor holds an active employee
      // membership for are visible — resolved via indexed `distinct()`
      // queries, never by loading every membership/case into memory.
      if (!can(req, 'cases.view_all')) {
        const adminUserId = req.session.adminUser && req.session.adminUser.id;
        if (!adminUserId) {
          filter._id = { $in: [] }; // env-fallback session without view_all: nothing to show
        } else {
          const workspaceIds = await WorkspaceMember.distinct('workspace', {
            adminUser: adminUserId,
            memberType: 'employee',
            status: 'active',
          });
          const caseIds = await CaseWorkspace.distinct('case', { _id: { $in: workspaceIds } });
          filter._id = { $in: caseIds };
        }
      }

      const [cases, total, teamMembers] = await Promise.all([
        ClientCase.find(filter)
          .populate('primaryClient', 'email firstName lastName')
          .populate('projectManager', 'name role')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ClientCase.countDocuments(filter),
        AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
      ]);

      res.render('admin/cases/index', {
        title: 'Cases | Admin',
        cases,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        stageFilter: stage,
        projectManagerFilter: projectManager,
        archivedOnly: archived,
        caseStages: CASE_STAGES,
        caseTypes: CASE_TYPES,
        teamMembers,
        currentPage: 'cases',
      });
    } catch (err) {
      console.error('[admin/cases/index]', err.message);
      res.redirect('/admin');
    }
  });

  // ======================================================================
  // CASE DETAIL
  // ======================================================================

  router.get('/admin/cases/:id', requireCapability('cases.view'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
      if (!loaded) return res.redirect('/admin/cases');
      const { caseDoc, workspace } = loaded;

      if (!(await casePolicy.canViewCase(req, workspace._id))) {
        return res.status(403).send('Forbidden: you do not have access to this case.');
      }

      const [primaryClient, projectManager, members, activity, consultation, tasks, teamMembers] =
        await Promise.all([
          ClientUser.findById(caseDoc.primaryClient).lean(),
          AdminUser.findById(caseDoc.projectManager).select('name role').lean(),
          WorkspaceMember.find({ workspace: workspace._id, status: { $ne: 'removed' } })
            .populate('clientUser', 'email firstName lastName')
            .populate('adminUser', 'name role')
            .sort({ createdAt: 1 })
            .lean(),
          CaseActivity.find({ case: caseDoc._id }).sort({ createdAt: -1 }).limit(50).lean(),
          caseDoc.consultation ? Consultation.findById(caseDoc.consultation).lean() : null,
          caseDoc.consultation
            ? Task.find({ lead: caseDoc.consultation }).populate('assignee', 'name').lean()
            : [],
          AdminUser.find({ isActive: true }).select('name role').sort({ name: 1 }).lean(),
        ]);

      const canManage = await casePolicy.canManageCase(req, workspace._id);
      const canAssign = await casePolicy.canAssignCase(req, workspace._id);
      const canArchive = await casePolicy.canArchiveCase(req, workspace._id);
      const canManageMembers = await casePolicy.canManageWorkspaceMembers(req, workspace._id);

      res.render('admin/cases/detail', {
        title: `Case: ${caseDoc.caseNumber} | Admin`,
        caseDoc,
        workspace,
        primaryClient,
        projectManager,
        members,
        activity,
        consultation,
        tasks,
        teamMembers,
        caseStages: CASE_STAGES,
        canManage,
        canAssign,
        canArchive,
        canManageMembers,
        canPublishUpdate: can(req, 'client_updates.publish'),
        flash: req.session.caseFlash || null,
        workspaceRoles: WORKSPACE_ROLES,
        currentPage: 'cases',
      });
      delete req.session.caseFlash;
    } catch (err) {
      console.error('[admin/cases/detail]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // CONVERT LEAD TO CASE
  // ======================================================================

  router.post('/admin/leads/:id/convert-to-case', requireCapability('cases.create'), async (req, res) => {
    try {
      const actor = actorFromSession(req);
      const employeeMemberIds = Array.isArray(req.body.employeeMemberIds)
        ? req.body.employeeMemberIds
        : req.body.employeeMemberIds
          ? [req.body.employeeMemberIds]
          : [];

      const result = await convertConsultationToCase({
        consultationId: req.params.id,
        input: {
          caseType: req.body.caseType,
          title: req.body.title,
          projectManagerId: req.body.projectManagerId,
          employeeMemberIds,
          targetFilingDate: req.body.targetFilingDate,
          priority: req.body.priority,
          description: req.body.description,
        },
        actor,
      });

      if (result.outcome === 'not_found') {
        return res.status(404).send('Consultation not found.');
      }
      if (result.outcome === 'validation_error') {
        req.session.caseConversionErrors = result.errors;
        return res.redirect(`/admin/leads/${req.params.id}`);
      }
      // 'already_converted' and 'converted' both land on the resulting case
      // — a repeated conversion attempt is not an error to the user, it's
      // a safe no-op that shows them the (possibly pre-existing) case.
      return res.redirect(`/admin/cases/${result.case._id}`);
    } catch (err) {
      console.error('[admin/leads/convert-to-case]', err.message);
      res.status(500).send('Something went wrong converting this lead to a case.');
    }
  });

  // ======================================================================
  // MEMBERSHIP MANAGEMENT
  // ======================================================================

  router.post('/admin/cases/:id/members', requireCapability('workspace.members.manage'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await casePolicy.canManageWorkspaceMembers(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const { memberType } = req.body;

      const result =
        memberType === 'client'
          ? await caseManagement.addClientMember({ caseDoc, workspace, clientUserId: req.body.clientUserId, actor })
          : await caseManagement.addEmployeeMember({
              caseDoc,
              workspace,
              adminUserId: req.body.adminUserId,
              workspaceRole: req.body.workspaceRole,
              clientVisible: req.body.clientVisible === 'on',
              actor,
            });

      if (result.outcome === 'validation_error') {
        console.warn('[admin/cases/members] validation error:', result.errors);
      }
      res.redirect(`/admin/cases/${req.params.id}`);
    } catch (err) {
      console.error('[admin/cases/members]', err.message);
      res.redirect(`/admin/cases/${req.params.id}`);
    }
  });

  router.delete(
    '/admin/cases/:id/members/:memberId',
    requireCapability('workspace.members.manage'),
    async (req, res) => {
      try {
        const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
        if (!loaded) return res.status(404).send('Case not found.');
        const { caseDoc, workspace } = loaded;

        if (!(await casePolicy.canManageWorkspaceMembers(req, workspace._id))) {
          return res.status(403).send('Forbidden.');
        }

        const actor = actorFromSession(req);
        await caseManagement.removeMemberFromCase({
          caseDoc,
          workspace,
          memberId: req.params.memberId,
          actor,
        });
        res.redirect(`/admin/cases/${req.params.id}`);
      } catch (err) {
        console.error('[admin/cases/members/remove]', err.message);
        res.redirect(`/admin/cases/${req.params.id}`);
      }
    },
  );

  // ======================================================================
  // PROJECT MANAGER CHANGE
  // ======================================================================

  router.post('/admin/cases/:id/manager', requireCapability('cases.assign'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await casePolicy.canAssignCase(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      await caseManagement.changeProjectManager({
        caseDoc,
        workspace,
        newManagerId: req.body.projectManagerId,
        actor,
      });
      res.redirect(`/admin/cases/${req.params.id}`);
    } catch (err) {
      console.error('[admin/cases/manager]', err.message);
      res.redirect(`/admin/cases/${req.params.id}`);
    }
  });

  // ======================================================================
  // STAGE UPDATE
  // ======================================================================

  router.post('/admin/cases/:id/stage', requireCapability('cases.manage'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await casePolicy.canManageCase(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      await caseManagement.updateStage({ caseDoc, workspace, newStage: req.body.stage, actor });
      res.redirect(`/admin/cases/${req.params.id}`);
    } catch (err) {
      console.error('[admin/cases/stage]', err.message);
      res.redirect(`/admin/cases/${req.params.id}`);
    }
  });

  // ======================================================================
  // ARCHIVE
  // ======================================================================

  router.post('/admin/cases/:id/archive', requireCapability('cases.archive'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await casePolicy.canArchiveCase(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      await caseManagement.archiveCase({ caseDoc, workspace, actor });
      res.redirect(`/admin/cases/${req.params.id}`);
    } catch (err) {
      console.error('[admin/cases/archive]', err.message);
      res.redirect(`/admin/cases/${req.params.id}`);
    }
  });

  // ======================================================================
  // PUBLISH CLIENT-VISIBLE UPDATE (Cycle 8 — ADR-007 §6)
  // ======================================================================

  router.post('/admin/cases/:id/client-update', requireCapability('client_updates.publish'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.id);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      // Record-level check on top of the capability — a PM may only publish
      // to a case they're actually a member of.
      if (!(await casePolicy.canViewCase(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const body = String(req.body.body || '').trim().slice(0, MAX_MESSAGE_BODY_LENGTH);
      if (!body) return res.redirect(`/admin/cases/${req.params.id}`);

      const actor = actorFromSession(req);
      const publishedAtIso = new Date().toISOString();

      const message = await emitClientUpdateMessage({
        workspaceId: workspace._id,
        caseId: caseDoc._id,
        body,
        publishedAtIso,
      });

      // emitSystemMessage no-ops when the case_updates channel was never
      // provisioned (a pre-Cycle-6 case) — surface that rather than
      // silently reporting success.
      if (!message) {
        req.session.caseFlash = {
          type: 'error',
          message: 'This case has no Case Updates channel yet. Initialize its channels first.',
        };
        return res.redirect(`/admin/cases/${req.params.id}`);
      }

      await CaseActivity.record({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        type: 'client_update_published',
        message: `${actor.name} published a client-visible update.`,
        actor,
      });

      req.session.caseFlash = { type: 'success', message: 'Update published to the client.' };
      res.redirect(`/admin/cases/${req.params.id}`);
    } catch (err) {
      console.error('[admin/cases/client-update]', err.message);
      res.redirect(`/admin/cases/${req.params.id}`);
    }
  });
};

module.exports.CASE_TYPES = CASE_TYPES;
module.exports.CASE_STAGES = CASE_STAGES;
