const express = require('express');

const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const caseManagement = require('../../../../services/caseManagement');
const packets = require('../../../../services/filingPacketManagement');
const { canAccessCase, capabilitiesOf } = require('../../../../services/filingPacketPolicy');

/**
 * Canonical staff Filing Packet API (ADR-023 §24). Handlers authorize
 * (capability, then case membership via filingPacketPolicy), delegate to
 * filingPacketManagement and map the outcome. Missing, malformed id, other case,
 * removed member and a source id from another case are one identical 404. There
 * is no client route and no hard-delete route; the API serves no file bytes.
 */

const router = express.Router();

const response = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const actorOf = (req) => ({ id: req.staff._id, name: req.staff.name || 'Employee' });
const body = (req) => req.body || {};
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
      throw createApiError(409, 'conflict', result.message || 'This packet was changed by someone else. Reload to see the latest version.', result.current);
    case 'invalid_state':
      throw createApiError(409, 'invalid_state', 'The packet is not in a state that allows that action.', result.current);
    case 'not_found':
      throw notFound(what);
    default:
  }
}

async function detailFor(req, packet) {
  const [readiness, versions] = await Promise.all([packets.resolveReadiness(packet), packets.listVersions(packet._id)]);
  return packets.toDetail(packet, readiness, capabilitiesOf(req), versions);
}

/** Loads the packet the actor may see into req.packet, or answers the one identical 404. */
const packetParam = route(async (req, res, next) => {
  const packet = await packets.loadPacket(req.params.packetId);
  if (!packet || !(await canAccessCase(req, packet.workspace))) return next(notFound('Packet'));
  req.packet = packet;
  return next();
});

const caseParam = route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await canAccessCase(req, loaded.workspace._id))) return next(notFound('Case'));
  req.packetCase = loaded;
  return next();
});

/** Applies a service call and answers with the refreshed detail DTO. */
const mutation = (call, { status = 200, what = 'Packet' } = {}) =>
  route(async (req, res) => {
    const result = await call(req);
    failOnOutcome(result, what);
    return response(res, req, await detailFor(req, result.packet), status);
  });

const mutating = [trustedOriginMiddleware];

// ---------------------------------------------------------------------------
// Case-level
// ---------------------------------------------------------------------------

// GET /api/v1/staff/cases/:caseId/filing-packets
router.get('/cases/:caseId/filing-packets', requireApiCapability('filing_packets.view'), caseParam, route(async (req, res) => {
  const list = await packets.listCasePackets(req.packetCase.caseDoc._id);
  const caps = capabilitiesOf(req);
  const summaries = await Promise.all(list.map(async (packet) => packets.toSummary(packet, await packets.resolveReadiness(packet), caps)));
  return response(res, req, { packets: summaries, canProvision: caps.manage });
}));

// POST /api/v1/staff/cases/:caseId/filing-packets/provision — idempotent initial packet
router.post('/cases/:caseId/filing-packets/provision', ...mutating, requireApiCapability('filing_packets.manage'), caseParam, route(async (req, res) => {
  const { caseDoc, workspace } = req.packetCase;
  const result = await packets.provisionInitialPacket({ caseDoc, workspace, actor: actorOf(req) });
  failOnOutcome(result, 'Packet');
  return response(res, req, await detailFor(req, result.packet), result.outcome === 'saved' ? 201 : 200);
}));

// POST /api/v1/staff/cases/:caseId/filing-packets
router.post('/cases/:caseId/filing-packets', ...mutating, requireApiCapability('filing_packets.manage'), caseParam, route(async (req, res) => {
  const { caseDoc, workspace } = req.packetCase;
  const { kind, title, description } = body(req);
  const result = await packets.createPacket({ caseDoc, workspace, kind, title, description, actor: actorOf(req) });
  failOnOutcome(result, 'Packet');
  return response(res, req, await detailFor(req, result.packet), 201);
}));

// ---------------------------------------------------------------------------
// One packet
// ---------------------------------------------------------------------------

// GET /api/v1/staff/filing-packets/:packetId
router.get('/filing-packets/:packetId', requireApiCapability('filing_packets.view'), packetParam, route(async (req, res) => response(res, req, await detailFor(req, req.packet))));

// PATCH /api/v1/staff/filing-packets/:packetId  { revision, title?, description? }
router.patch('/filing-packets/:packetId', ...mutating, requireApiCapability('filing_packets.manage'), packetParam, mutation((req) =>
  packets.updateMetadata({ packet: req.packet, revision: body(req).revision, title: body(req).title, description: body(req).description, actor: actorOf(req) })));

// POST /api/v1/staff/filing-packets/:packetId/petition-version  { revision, petitionVersionId|null }
router.post('/filing-packets/:packetId/petition-version', ...mutating, requireApiCapability('filing_packets.manage'), packetParam, mutation((req) =>
  packets.setPetitionVersion({ packet: req.packet, revision: body(req).revision, petitionVersionId: body(req).petitionVersionId || null, actor: actorOf(req) }), { what: 'Petition version' }));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

// GET /api/v1/staff/filing-packets/:packetId/candidates?type=petition_version|document_version|smart_form
router.get('/filing-packets/:packetId/candidates', requireApiCapability('filing_packets.view'), packetParam, route(async (req, res) => {
  const candidates = await packets.listCandidates(req.packet, String(req.query.type || ''));
  if (!candidates) throw createApiError(400, 'validation_error', 'Choose a valid candidate type.', { type: 'Invalid type.' });
  return response(res, req, { candidates });
}));

// POST /api/v1/staff/filing-packets/:packetId/items
//   { revision, type: 'document_version', documentId, versionId, role?, required?, notes? }
//   { revision, type: 'smart_form_reference', smartFormId, role?, required?, notes? }
router.post('/filing-packets/:packetId/items', ...mutating, requireApiCapability('filing_packets.manage'), packetParam, mutation((req) => {
  const b = body(req);
  const common = { packet: req.packet, revision: b.revision, role: b.role, required: b.required, notes: b.notes, actor: actorOf(req) };
  if (b.type === 'document_version') return packets.addDocumentItem({ ...common, documentId: b.documentId, versionId: b.versionId });
  if (b.type === 'smart_form_reference') return packets.addSmartFormReference({ ...common, smartFormId: b.smartFormId });
  return { outcome: 'validation_error', errors: { type: 'Choose document_version or smart_form_reference.' } };
}, { status: 201, what: 'Source' }));

// PATCH /api/v1/staff/filing-packets/:packetId/items/:itemId  { revision, role?, required?, notes? }
router.patch('/filing-packets/:packetId/items/:itemId', ...mutating, requireApiCapability('filing_packets.manage'), packetParam, mutation((req) =>
  packets.updateItem({ packet: req.packet, revision: body(req).revision, itemId: req.params.itemId, role: body(req).role, required: body(req).required, notes: body(req).notes, actor: actorOf(req) }), { what: 'Item' }));

// DELETE /api/v1/staff/filing-packets/:packetId/items/:itemId?revision=
router.delete('/filing-packets/:packetId/items/:itemId', ...mutating, requireApiCapability('filing_packets.manage'), packetParam, mutation((req) =>
  packets.removeItem({ packet: req.packet, revision: Number(req.query.revision), itemId: req.params.itemId, actor: actorOf(req) }), { what: 'Item' }));

// POST /api/v1/staff/filing-packets/:packetId/reorder  { revision, orderedItemIds }
router.post('/filing-packets/:packetId/reorder', ...mutating, requireApiCapability('filing_packets.manage'), packetParam, mutation((req) =>
  packets.reorderItems({ packet: req.packet, revision: body(req).revision, orderedItemIds: body(req).orderedItemIds, actor: actorOf(req) })));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const lifecycle = (path, capability, call) =>
  router.post(`/filing-packets/:packetId/${path}`, ...mutating, requireApiCapability(capability), packetParam, mutation((req) => call({ packet: req.packet, revision: body(req).revision, note: body(req).internalReviewNote, actor: actorOf(req) })));

lifecycle('submit', 'filing_packets.manage', packets.submitPacket);
lifecycle('return', 'filing_packets.review', packets.returnPacket);
lifecycle('approve', 'filing_packets.review', packets.approvePacket);
lifecycle('finalize', 'filing_packets.finalize', packets.finalizePacket);

// ---------------------------------------------------------------------------
// Versions (immutable, read-only)
// ---------------------------------------------------------------------------

// GET /api/v1/staff/filing-packets/:packetId/versions
router.get('/filing-packets/:packetId/versions', requireApiCapability('filing_packets.view'), packetParam, route(async (req, res) =>
  response(res, req, { versions: (await packets.listVersions(req.packet._id)).map(packets.toVersionSummary) })));

// GET /api/v1/staff/filing-packets/:packetId/versions/:versionId
router.get('/filing-packets/:packetId/versions/:versionId', requireApiCapability('filing_packets.view'), packetParam, route(async (req, res, next) => {
  const version = await packets.getVersion(req.packet._id, req.params.versionId);
  if (!version) return next(notFound('Version'));
  return response(res, req, packets.toVersionDetail(version, capabilitiesOf(req)));
}));

module.exports = router;
