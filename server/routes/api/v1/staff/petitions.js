const express = require('express');

const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const caseManagement = require('../../../../services/caseManagement');
const petitions = require('../../../../services/petitionManagement');
const { canAccessCase, capabilitiesOf } = require('../../../../services/petitionPolicy');
const { DEPENDENCY_TYPES } = require('../../../../utils/petitionConstants');

/**
 * Canonical staff Petition Work API (ADR-022 §21). Handlers authorize
 * (capability, then case membership via petitionPolicy), delegate to
 * petitionManagement and map the outcome. Missing, malformed id, other case and
 * removed member are one identical 404. Petition text never leaves this API:
 * there is no client route and no hard-delete route.
 */

const router = express.Router();

const response = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const actorOf = (req) => ({ id: req.staff._id, name: req.staff.name || 'Employee' });
const route = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};

function failOnOutcome(result, what) {
  switch (result.outcome) {
    case 'validation_error':
      throw createApiError(400, 'validation_error', 'Please correct the highlighted fields.', result.errors);
    case 'conflict':
      throw createApiError(409, 'conflict', result.message || 'This petition was changed by someone else. Reload to see the latest version.', result.current);
    case 'invalid_state':
      throw createApiError(409, 'invalid_state', 'The petition is not in a state that allows that action.', result.current);
    case 'forbidden':
      throw createApiError(403, 'forbidden', result.message || 'You do not have permission to do that.');
    case 'not_found':
      throw notFound(what);
    default:
  }
}

/** Resolved dependencies + versions + capability-aware actions: the one detail DTO. */
async function detailFor(req, petition) {
  const [resolved, versions] = await Promise.all([petitions.resolveDependencies(petition), petitions.listVersions(petition._id)]);
  return petitions.toDetail(petition, resolved, capabilitiesOf(req), req.staff._id, versions);
}

async function summariesFor(req, list) {
  const caps = capabilitiesOf(req);
  return Promise.all(list.map(async (petition) => petitions.toSummary(petition, await petitions.resolveDependencies(petition), caps)));
}

/** Loads the petition the actor may see into req.petition, or answers the one identical 404. */
const petitionParam = route(async (req, res, next) => {
  const petition = await petitions.loadPetition(req.params.petitionId);
  if (!petition || !(await canAccessCase(req, petition.workspace))) return next(notFound('Petition'));
  req.petition = petition;
  return next();
});

const caseParam = route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await canAccessCase(req, loaded.workspace._id))) return next(notFound('Case'));
  req.petitionCase = loaded;
  return next();
});

/** Applies a service call and answers with the refreshed detail DTO. */
const mutation = (call, { status = 200, what = 'Petition' } = {}) =>
  route(async (req, res) => {
    const result = await call(req);
    failOnOutcome(result, what);
    return response(res, req, await detailFor(req, result.petition), status);
  });

const mutating = [trustedOriginMiddleware];
const body = (req) => req.body || {};

// ---------------------------------------------------------------------------
// Case-level
// ---------------------------------------------------------------------------

// GET /api/v1/staff/cases/:caseId/petitions
router.get('/cases/:caseId/petitions', requireApiCapability('petitions.view'), caseParam, route(async (req, res) => {
  const list = await petitions.listCasePetitions(req.petitionCase.caseDoc._id);
  return response(res, req, { petitions: await summariesFor(req, list), canProvision: capabilitiesOf(req).manage });
}));

// POST /api/v1/staff/cases/:caseId/petitions/provision — idempotent primary petition
router.post('/cases/:caseId/petitions/provision', ...mutating, requireApiCapability('petitions.manage'), caseParam, route(async (req, res) => {
  const { caseDoc, workspace } = req.petitionCase;
  const result = await petitions.provisionPrimaryPetition({ caseDoc, workspace, actor: actorOf(req) });
  failOnOutcome(result, 'Petition');
  return response(res, req, await detailFor(req, result.petition), result.outcome === 'saved' ? 201 : 200);
}));

// POST /api/v1/staff/cases/:caseId/petitions
router.post('/cases/:caseId/petitions', ...mutating, requireApiCapability('petitions.manage'), caseParam, route(async (req, res) => {
  const { caseDoc, workspace } = req.petitionCase;
  const { kind, title, description } = body(req);
  const result = await petitions.createPetition({ caseDoc, workspace, kind, title, description, actor: actorOf(req) });
  failOnOutcome(result, 'Petition');
  return response(res, req, await detailFor(req, result.petition), 201);
}));

// ---------------------------------------------------------------------------
// One petition
// ---------------------------------------------------------------------------

// GET /api/v1/staff/petitions/:petitionId
router.get('/petitions/:petitionId', requireApiCapability('petitions.view'), petitionParam, route(async (req, res) => response(res, req, await detailFor(req, req.petition))));

// PATCH /api/v1/staff/petitions/:petitionId  { revision, title?, description? }
router.patch('/petitions/:petitionId', ...mutating, requireApiCapability('petitions.manage'), petitionParam, mutation((req) =>
  petitions.updateMetadata({ petition: req.petition, revision: body(req).revision, title: body(req).title, description: body(req).description, actor: actorOf(req) })));

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const sectionCall = (fn) => (req) => fn({ petition: req.petition, sectionKey: req.params.sectionKey, revision: body(req).revision, actor: actorOf(req), caps: capabilitiesOf(req) });

// PATCH /api/v1/staff/petitions/:petitionId/sections/:sectionKey  { revision, body }  — autosave
router.patch('/petitions/:petitionId/sections/:sectionKey', ...mutating, requireApiCapability('petitions.edit'), petitionParam, mutation((req) =>
  petitions.saveSection({ petition: req.petition, sectionKey: req.params.sectionKey, body: body(req).body, revision: body(req).revision, actor: actorOf(req), caps: capabilitiesOf(req) }), { what: 'Section' }));

// POST .../sections/:sectionKey/assign  { revision, assigneeId|null }
router.post('/petitions/:petitionId/sections/:sectionKey/assign', ...mutating, requireApiCapability('petitions.manage'), petitionParam, mutation((req) =>
  petitions.assignSection({ petition: req.petition, sectionKey: req.params.sectionKey, assigneeId: body(req).assigneeId || null, revision: body(req).revision, actor: actorOf(req) }), { what: 'Section' }));

// POST .../sections/:sectionKey/review  { revision } — mark ready for review
router.post('/petitions/:petitionId/sections/:sectionKey/review', ...mutating, requireApiCapability('petitions.edit'), petitionParam, mutation(sectionCall((args) => petitions.reviewSection('ready', args)), { what: 'Section' }));

// POST .../sections/:sectionKey/return  { revision, reviewNote }
router.post('/petitions/:petitionId/sections/:sectionKey/return', ...mutating, requireApiCapability('petitions.review'), petitionParam, mutation((req) =>
  petitions.reviewSection('return', { petition: req.petition, sectionKey: req.params.sectionKey, revision: body(req).revision, note: body(req).reviewNote, actor: actorOf(req), caps: capabilitiesOf(req) }), { what: 'Section' }));

// POST .../sections/:sectionKey/approve  { revision }
router.post('/petitions/:petitionId/sections/:sectionKey/approve', ...mutating, requireApiCapability('petitions.review'), petitionParam, mutation(sectionCall((args) => petitions.reviewSection('approve', args)), { what: 'Section' }));

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

// GET /api/v1/staff/petitions/:petitionId/dependency-candidates?type=
router.get('/petitions/:petitionId/dependency-candidates', requireApiCapability('petitions.view'), petitionParam, route(async (req, res) => {
  const type = String(req.query.type || '');
  if (!DEPENDENCY_TYPES.includes(type)) throw createApiError(400, 'validation_error', 'Choose a valid dependency type.', { type: 'Invalid type.' });
  return response(res, req, { candidates: await petitions.listCandidates(req.petition, type) });
}));

// POST /api/v1/staff/petitions/:petitionId/dependencies  { revision, type, refId, role?, requiredForFinalization? }
router.post('/petitions/:petitionId/dependencies', ...mutating, requireApiCapability('petitions.edit'), petitionParam, mutation((req) =>
  petitions.addDependency({ petition: req.petition, revision: body(req).revision, type: body(req).type, refId: body(req).refId, role: body(req).role, requiredForFinalization: body(req).requiredForFinalization, actor: actorOf(req) }), { status: 201, what: 'Item' }));

// DELETE /api/v1/staff/petitions/:petitionId/dependencies/:dependencyId?revision=
router.delete('/petitions/:petitionId/dependencies/:dependencyId', ...mutating, requireApiCapability('petitions.edit'), petitionParam, mutation((req) =>
  petitions.removeDependency({ petition: req.petition, revision: Number(req.query.revision), dependencyId: req.params.dependencyId, actor: actorOf(req) }), { what: 'Dependency' }));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const lifecycle = (path, capability, call) =>
  router.post(`/petitions/:petitionId/${path}`, ...mutating, requireApiCapability(capability), petitionParam, mutation((req) => call({ petition: req.petition, revision: body(req).revision, note: body(req).internalReviewNote, actor: actorOf(req) })));

lifecycle('submit', 'petitions.manage', petitions.submitPetition);
lifecycle('return', 'petitions.review', petitions.returnPetition);
lifecycle('approve', 'petitions.review', petitions.approvePetition);
lifecycle('finalize', 'petitions.finalize', petitions.finalizePetition);

// ---------------------------------------------------------------------------
// Versions (immutable, read-only)
// ---------------------------------------------------------------------------

// GET /api/v1/staff/petitions/:petitionId/versions
router.get('/petitions/:petitionId/versions', requireApiCapability('petitions.view'), petitionParam, route(async (req, res) =>
  response(res, req, { versions: (await petitions.listVersions(req.petition._id)).map(petitions.toVersionSummary) })));

// GET /api/v1/staff/petitions/:petitionId/versions/:versionId
router.get('/petitions/:petitionId/versions/:versionId', requireApiCapability('petitions.view'), petitionParam, route(async (req, res, next) => {
  const version = await petitions.getVersion(req.petition._id, req.params.versionId);
  if (!version) return next(notFound('Version'));
  return response(res, req, petitions.toVersionDetail(version));
}));

module.exports = router;
