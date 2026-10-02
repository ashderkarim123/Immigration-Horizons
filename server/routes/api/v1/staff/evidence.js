/**
 * Staff API: case evidence checklist (ADR-018).
 *
 * Authorization is derived from the case's primary CaseWorkspace, never from a
 * field on ClientCase. A missing, malformed, inaccessible or removed-member
 * target is one identical 404 (no existence oracle); an actor who may view a
 * case's evidence but not change it gets 403 on mutations. The domain lives in
 * services/evidenceManagement.js — handlers authorize, delegate and map outcomes.
 */
const express = require('express');

const evidenceManagement = require('../../../../services/evidenceManagement');
const { loadCaseAndWorkspace } = require('../../../../services/caseManagement');
const { canViewEvidence, canManageEvidence } = require('../../../../services/casePolicy');
const { createApiError } = require('../../../../middleware/api/apiError');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');

const router = express.Router();

const respond = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const route = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);

/** Maps a service outcome that is not a success onto the API error envelope. */
function failOnOutcome(result) {
  switch (result.outcome) {
    case 'validation_error':
      throw createApiError(422, 'validation_error', 'Please correct the highlighted fields.', Object.entries(result.errors).map(([field, message]) => ({ field, message })));
    case 'not_found':
      throw notFound('Evidence requirement');
    case 'document_not_found':
      throw notFound('Document');
    default:
  }
}

/** Resolves the case + primary workspace the actor may view into req.evidence, else the one 404. */
const caseContext = route(async (req, res, next) => {
  const loaded = await loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await canViewEvidence(req, loaded.workspace._id))) return next(notFound('Case'));
  req.evidence = loaded;
  return next();
});

/** Same for a requirement: authorize against the requirement's own workspace. */
const requirementContext = route(async (req, res, next) => {
  const requirement = await evidenceManagement.findRequirementForAuth(req.params.requirementId);
  if (!requirement || !(await canViewEvidence(req, requirement.workspace))) return next(notFound('Evidence requirement'));
  req.evidence = { requirement, workspaceId: requirement.workspace };
  return next();
});

/** Mutations additionally need the manage action on the resolved workspace. */
const requireManage = route(async (req, res, next) => {
  const workspaceId = req.evidence.workspace ? req.evidence.workspace._id : req.evidence.workspaceId;
  if (!(await canManageEvidence(req, workspaceId))) return next(createApiError(403, 'forbidden', 'Insufficient capability.'));
  return next();
});

const actorOf = (req) => ({ id: req.staff._id, name: req.staff.name || 'Employee' });

// GET /api/v1/staff/cases/:caseId/evidence
router.get('/cases/:caseId/evidence', caseContext, route(async (req, res) => {
  const result = await evidenceManagement.listCaseRequirements(req.evidence);
  const canManage = await canManageEvidence(req, req.evidence.workspace._id);
  respond(res, req, { ...result, actions: { canManage } });
}));

// GET /api/v1/staff/cases/:caseId/evidence/templates — active templates for this case's type
router.get('/cases/:caseId/evidence/templates', caseContext, route(async (req, res) => {
  respond(res, req, { templates: await evidenceManagement.listActiveTemplates(req.evidence) });
}));

// GET /api/v1/staff/cases/:caseId/evidence/eligible-documents
router.get('/cases/:caseId/evidence/eligible-documents', caseContext, requireManage, route(async (req, res) => {
  respond(res, req, { documents: await evidenceManagement.listEligibleDocuments(req.evidence) });
}));

// POST /api/v1/staff/cases/:caseId/evidence/provision
router.post('/cases/:caseId/evidence/provision', trustedOriginMiddleware, caseContext, requireManage, route(async (req, res) => {
  const { templateKey, version } = req.body;
  const result = await evidenceManagement.provisionChecklist({ ...req.evidence, templateKey, version, actor: actorOf(req) });
  failOnOutcome(result);
  respond(res, req, { created: result.created, skipped: result.skipped, template: result.template });
}));

// POST /api/v1/staff/cases/:caseId/evidence/requirements
router.post('/cases/:caseId/evidence/requirements', trustedOriginMiddleware, caseContext, requireManage, route(async (req, res) => {
  const result = await evidenceManagement.createCustomRequirement({ ...req.evidence, data: req.body || {}, actor: actorOf(req) });
  failOnOutcome(result);
  respond(res, req, result.requirement, 201);
}));

// PATCH /api/v1/staff/evidence/requirements/:requirementId/status
router.patch('/evidence/requirements/:requirementId/status', trustedOriginMiddleware, requirementContext, requireManage, route(async (req, res) => {
  const { status, reason } = req.body || {};
  const result = await evidenceManagement.updateRequirementStatus({ requirementId: req.params.requirementId, status, reason, actor: actorOf(req) });
  failOnOutcome(result);
  respond(res, req, result.requirement);
}));

// POST /api/v1/staff/evidence/requirements/:requirementId/documents
router.post('/evidence/requirements/:requirementId/documents', trustedOriginMiddleware, requirementContext, requireManage, route(async (req, res) => {
  const result = await evidenceManagement.linkDocument({ requirementId: req.params.requirementId, documentId: (req.body || {}).documentId });
  failOnOutcome(result);
  respond(res, req, result.requirement);
}));

// DELETE /api/v1/staff/evidence/requirements/:requirementId/documents/:documentId
router.delete('/evidence/requirements/:requirementId/documents/:documentId', trustedOriginMiddleware, requirementContext, requireManage, route(async (req, res) => {
  const result = await evidenceManagement.unlinkDocument({ requirementId: req.params.requirementId, documentId: req.params.documentId });
  failOnOutcome(result);
  respond(res, req, result.requirement);
}));

module.exports = router;
