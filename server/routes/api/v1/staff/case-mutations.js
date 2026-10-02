/**
 * Staff API: canonical case mutation endpoints (Gate B — ADR-016).
 *
 * All mutations:
 * 1. staffAuthMiddleware + requirePasswordSetupComplete (applied in parent index.js)
 * 2. Load case + workspace via caseManagement.loadCaseAndWorkspace
 * 3. Conceal: return 404 for not-found OR inaccessible (no 403 existence oracle)
 * 4. Apply casePolicy authorization check
 * 5. Call domain service — NEVER re-implement business logic here
 * 6. Return intentional DTO + requestId
 *
 * Do not replicate caseManagement.js or casePolicy.js logic.
 */
const express = require('express');
const router = express.Router({ mergeParams: true });

const {
  loadCaseAndWorkspace,
  updateStage,
  changeProjectManager,
  archiveCase,
  addEmployeeMember,
  removeMemberFromCase,
} = require('../../../../services/caseManagement');

const {
  canManageCase,
  canAssignCase,
  canArchiveCase,
  canManageWorkspaceMembers,
  canViewCase,
} = require('../../../../services/casePolicy');

const { can } = require('../../../../utils/permissions');
const { createApiError } = require('../../../../middleware/api/apiError');
const { staffAuthMiddleware, requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');

// ─── Actor snapshot helper ────────────────────────────────────────────────

function actorFromReq(req) {
  const staff = req.staff;
  if (!staff) return { type: 'system', id: null, name: 'System' };
  return {
    type: 'admin_user',
    id: staff._id,
    name: staff.name || staff.email || String(staff._id),
  };
}

// ─── Shared load + auth helper ────────────────────────────────────────────

async function loadAndAuthorize(req, next, policyFn) {
  const { caseId } = req.params;
  const result = await loadCaseAndWorkspace(caseId);
  if (!result) {
    next(createApiError(404, 'not_found', 'Case not found.'));
    return null;
  }
  const { caseDoc, workspace } = result;
  const allowed = await policyFn(req, workspace._id);
  if (!allowed) {
    next(createApiError(404, 'not_found', 'Case not found.'));
    return null;
  }
  return { caseDoc, workspace };
}

// ─── Stage mutation ───────────────────────────────────────────────────────

// PATCH /api/v1/staff/cases/:caseId/stage
// Requires cases.manage capability + active workspace membership
router.patch('/stage',
  trustedOriginMiddleware,
  staffAuthMiddleware,
  requireApiCapability('cases.manage'),
  async (req, res, next) => {
    try {
      const loaded = await loadAndAuthorize(req, next, canManageCase);
      if (!loaded) return;
      const { caseDoc, workspace } = loaded;

      const { stage } = req.body;
      if (!stage) {
        return next(createApiError(400, 'invalid_input', null, [
          { field: 'stage', message: 'Stage is required.' },
        ]));
      }

      const result = await updateStage({
        caseDoc,
        workspace,
        newStage: stage,
        actor: actorFromReq(req),
      });

      if (result.outcome === 'validation_error') {
        return next(createApiError(422, 'validation_error', null,
          Object.entries(result.errors).map(([field, message]) => ({ field, message }))));
      }

      res.json({
        data: { outcome: result.outcome, caseId: caseDoc._id, stage: result.case.currentStage },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  });

// ─── Project manager mutation ─────────────────────────────────────────────

// PATCH /api/v1/staff/cases/:caseId/project-manager
// Requires cases.assign capability
router.patch('/project-manager',
  trustedOriginMiddleware,
  staffAuthMiddleware,
  requireApiCapability('cases.assign'),
  async (req, res, next) => {
    try {
      const loaded = await loadAndAuthorize(req, next, canAssignCase);
      if (!loaded) return;
      const { caseDoc, workspace } = loaded;

      const { projectManagerId } = req.body;
      if (!projectManagerId) {
        return next(createApiError(400, 'invalid_input', null, [
          { field: 'projectManagerId', message: 'Project manager ID is required.' },
        ]));
      }

      const result = await changeProjectManager({
        caseDoc,
        workspace,
        newManagerId: projectManagerId,
        actor: actorFromReq(req),
      });

      if (result.outcome === 'validation_error') {
        return next(createApiError(422, 'validation_error', null,
          Object.entries(result.errors).map(([field, message]) => ({ field, message }))));
      }

      res.json({
        data: { outcome: result.outcome, caseId: caseDoc._id },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  });

// ─── Archive mutation ─────────────────────────────────────────────────────

// POST /api/v1/staff/cases/:caseId/archive
// Requires cases.archive capability
router.post('/archive',
  trustedOriginMiddleware,
  staffAuthMiddleware,
  requireApiCapability('cases.archive'),
  async (req, res, next) => {
    try {
      const loaded = await loadAndAuthorize(req, next, canArchiveCase);
      if (!loaded) return;
      const { caseDoc, workspace } = loaded;

      const result = await archiveCase({
        caseDoc,
        workspace,
        actor: actorFromReq(req),
      });

      res.json({
        data: { outcome: result.outcome, caseId: caseDoc._id },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  });

// ─── Members add ──────────────────────────────────────────────────────────

// POST /api/v1/staff/cases/:caseId/members
// Requires workspace.members.manage capability
router.post('/members',
  trustedOriginMiddleware,
  staffAuthMiddleware,
  requireApiCapability('workspace.members.manage'),
  async (req, res, next) => {
    try {
      const loaded = await loadAndAuthorize(req, next, canManageWorkspaceMembers);
      if (!loaded) return;
      const { caseDoc, workspace } = loaded;

      const { adminUserId, workspaceRole, clientVisible } = req.body;
      if (!adminUserId) {
        return next(createApiError(400, 'invalid_input', null, [
          { field: 'adminUserId', message: 'Team member ID is required.' },
        ]));
      }

      const result = await addEmployeeMember({
        caseDoc,
        workspace,
        adminUserId,
        workspaceRole: workspaceRole || 'contributor',
        clientVisible: clientVisible !== false,
        actor: actorFromReq(req),
      });

      if (result.outcome === 'validation_error') {
        return next(createApiError(422, 'validation_error', null,
          Object.entries(result.errors).map(([field, message]) => ({ field, message }))));
      }

      res.status(201).json({
        data: { outcome: result.outcome, memberId: result.member ? result.member._id : null },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  });

// ─── Members remove ───────────────────────────────────────────────────────

// DELETE /api/v1/staff/cases/:caseId/members/:memberId
// Requires workspace.members.manage capability
router.delete('/members/:memberId',
  trustedOriginMiddleware,
  staffAuthMiddleware,
  requireApiCapability('workspace.members.manage'),
  async (req, res, next) => {
    try {
      const loaded = await loadAndAuthorize(req, next, canManageWorkspaceMembers);
      if (!loaded) return;
      const { caseDoc, workspace } = loaded;

      const result = await removeMemberFromCase({
        caseDoc,
        workspace,
        memberId: req.params.memberId,
        actor: actorFromReq(req),
      });

      if (result.outcome === 'not_found') {
        return next(createApiError(404, 'not_found', 'Member not found.'));
      }
      if (result.outcome === 'validation_error') {
        return next(createApiError(422, 'validation_error', null,
          Object.entries(result.errors).map(([field, message]) => ({ field, message }))));
      }

      res.json({
        data: { outcome: result.outcome },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  });

// ─── Client updates ───────────────────────────────────────────────────────

// POST /api/v1/staff/cases/:caseId/client-updates
// Requires client_updates.publish capability + cases.view access
router.post('/client-updates',
  trustedOriginMiddleware,
  staffAuthMiddleware,
  requireApiCapability('client_updates.publish'),
  async (req, res, next) => {
    try {
      const loaded = await loadAndAuthorize(req, next, canViewCase);
      if (!loaded) return;
      const { caseDoc, workspace } = loaded;

      const { message } = req.body;
      if (!message || !String(message).trim()) {
        return next(createApiError(400, 'invalid_input', null, [
          { field: 'message', message: 'Message text is required.' },
        ]));
      }

      const trimmed = String(message).trim();
      if (trimmed.length > 2000) {
        return next(createApiError(422, 'validation_error', null, [
          { field: 'message', message: 'Message must not exceed 2000 characters.' },
        ]));
      }

      const { emitClientUpdateMessage } = require('../../../../services/systemMessageService');
      const actor = actorFromReq(req);
      const publishedAtIso = new Date().toISOString();

      const msgDoc = await emitClientUpdateMessage({
        workspaceId: workspace._id,
        caseId: caseDoc._id,
        body: trimmed,
        publishedAtIso,
      });

      const CaseActivity = require('../../../../models/CaseActivity');
      await CaseActivity.record({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        type: 'client_update_published',
        message: `Client update published by ${actor.name}.`,
        actor,
      });

      res.status(201).json({
        data: {
          outcome: 'published',
          messageId: msgDoc ? msgDoc._id : null,
        },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  });

module.exports = router;
