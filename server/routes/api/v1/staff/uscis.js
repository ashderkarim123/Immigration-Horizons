/**
 * Staff API: USCIS filing tracking (ADR-026). Handlers authorize (capability, then case row
 * access), delegate to services/uscisTracking.js and map outcomes. A missing, malformed,
 * inaccessible or removed-member filing or case is one identical 404; a visible case where the
 * actor lacks the capability is 403. The provider adapter is injected through
 * `req.app.locals.uscisProvider` so tests never touch the network.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');

const tracking = require('../../../../services/uscisTracking');
const caseManagement = require('../../../../services/caseManagement');
const { canAccessCase } = require('../../../../services/petitionPolicy');
const { can } = require('../../../../utils/permissions');
const { createTorchProvider } = require('../../../../services/uscis/torchProvider');
const { createApiError } = require('../../../../middleware/api/apiError');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');

const router = express.Router();

let defaultProvider = null;
const providerOf = (req) => req.app.locals.uscisProvider || (defaultProvider = defaultProvider || createTorchProvider());

const respond = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};
const fieldErrors = (errors) => Object.entries(errors).map(([field, message]) => ({ field, message }));

/** Maps a non-success service outcome to the API error envelope. */
function failOnOutcome(result) {
  switch (result.outcome) {
    case 'validation_error':
      throw createApiError(422, 'validation_error', 'Please correct the highlighted fields.', fieldErrors(result.errors));
    case 'conflict':
      throw createApiError(409, 'conflict', 'That receipt number is already tracked on another filing.', fieldErrors(result.errors));
    case 'invalid_state':
      throw createApiError(409, 'invalid_state', 'This filing is archived and can no longer be changed.');
    case 'provider_not_configured':
      throw createApiError(409, 'provider_not_configured', 'USCIS status refresh is not enabled for this environment.');
    case 'provider_error':
      if (result.code === 'provider_receipt_not_found') throw createApiError(422, 'receipt_not_found_at_uscis', 'USCIS did not recognize this receipt number.');
      if (result.code === 'provider_rate_limited') throw createApiError(429, 'provider_rate_limited', 'USCIS is limiting requests right now. Try again shortly.');
      throw createApiError(502, 'provider_unavailable', 'USCIS status could not be retrieved right now. The last known status is unchanged.');
    default:
  }
}

/** Case the actor may see, into req.uscisCase; else the one 404. */
const caseParam = route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await canAccessCase(req, loaded.workspace._id))) return next(notFound('Case'));
  req.uscisCase = loaded;
  return next();
});

/** Filing (and its case) the actor may see, into req.uscis; else the one 404. */
const filingParam = route(async (req, res, next) => {
  const ctx = await tracking.loadFilingContext(req.params.filingId);
  if (!ctx || !(await canAccessCase(req, ctx.workspace._id))) return next(notFound('Filing'));
  req.uscis = ctx;
  return next();
});

const detail = (req, filingId) => tracking.toDetail(req, filingId, providerOf(req).status());

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.USCIS_SYNC_RATE_LIMIT) || 10,
  keyGenerator: (req) => String(req.staff._id),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(createApiError(429, 'rate_limited', 'Too many refresh requests. Try again in a minute.')),
});

// GET /api/v1/staff/uscis/provider-status
router.get('/uscis/provider-status', requireApiCapability('uscis_tracking.view'), (req, res) => respond(res, req, providerOf(req).status()));

// GET /api/v1/staff/uscis   (cross-case queue)
router.get('/uscis', requireApiCapability('uscis_tracking.view'), route(async (req, res) => {
  respond(res, req, await tracking.queryFilings(req, req.query, providerOf(req).status()));
}));

// GET /api/v1/staff/cases/:caseId/uscis
router.get('/cases/:caseId/uscis', requireApiCapability('uscis_tracking.view'), caseParam, route(async (req, res) => {
  const filings = await tracking.listCaseFilings(req, req.uscisCase.caseDoc, { includeArchived: req.query.archived === 'true', providerStatus: providerOf(req).status() });
  respond(res, req, { filings, actions: { canCreate: can(req, 'uscis_tracking.manage') } });
}));

// POST /api/v1/staff/cases/:caseId/uscis
router.post('/cases/:caseId/uscis', trustedOriginMiddleware, requireApiCapability('uscis_tracking.manage'), caseParam, route(async (req, res) => {
  const { caseDoc, workspace } = req.uscisCase;
  const result = await tracking.createFiling({ caseDoc, workspace, data: req.body || {}, actor: tracking.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await detail(req, result.filing._id), 201);
}));

// GET /api/v1/staff/uscis/:filingId
router.get('/uscis/:filingId', requireApiCapability('uscis_tracking.view'), filingParam, route(async (req, res) => {
  respond(res, req, await detail(req, req.uscis.filing._id));
}));

// PATCH /api/v1/staff/uscis/:filingId
router.patch('/uscis/:filingId', trustedOriginMiddleware, requireApiCapability('uscis_tracking.manage'), filingParam, route(async (req, res) => {
  const result = await tracking.updateFiling({ ...req.uscis, data: req.body || {}, actor: tracking.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await detail(req, req.uscis.filing._id));
}));

// POST /api/v1/staff/uscis/:filingId/status-events
router.post('/uscis/:filingId/status-events', trustedOriginMiddleware, requireApiCapability('uscis_tracking.manage'), filingParam, route(async (req, res) => {
  const result = await tracking.addStatusEvent({ ...req.uscis, data: req.body || {}, actor: tracking.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await detail(req, req.uscis.filing._id), 201);
}));

// POST /api/v1/staff/uscis/:filingId/sync
router.post('/uscis/:filingId/sync', trustedOriginMiddleware, requireApiCapability('uscis_tracking.sync'), syncLimiter, filingParam, route(async (req, res) => {
  const result = await tracking.syncFiling({ ...req.uscis, provider: providerOf(req), actor: tracking.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await detail(req, req.uscis.filing._id));
}));

// POST /api/v1/staff/uscis/:filingId/archive   (there is no delete route: history is kept)
router.post('/uscis/:filingId/archive', trustedOriginMiddleware, requireApiCapability('uscis_tracking.manage'), filingParam, route(async (req, res) => {
  const result = await tracking.archiveFiling({ ...req.uscis, actor: tracking.actorOf(req.staff) });
  failOnOutcome(result);
  respond(res, req, await detail(req, req.uscis.filing._id));
}));

module.exports = router;
