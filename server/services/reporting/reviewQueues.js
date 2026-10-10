/**
 * Review and workflow queues (ADR-028): a SNAPSHOT of work waiting on someone, per queue and per case. Queues that already exist
 * on the Dashboard (documents to review, overdue document requests, evidence still needed, forms/petitions/filing packets to
 * review) reuse their definitions from staffWorkQueues, so Dashboard and Reports cannot silently disagree; the extra queues here
 * (quarantined documents, changes requested, USCIS action required, unanswered/overdue queries) are defined next to them with
 * explicit status sets. A queue the actor has no capability for is reported unavailable (null), never as zero.
 * This is workflow volume, not a legal-quality measure.
 */
const CaseDocument = require('../../models/CaseDocument');
const CaseSmartForm = require('../../models/CaseSmartForm');
const CasePetition = require('../../models/CasePetition');
const FilingPacket = require('../../models/FilingPacket');
const USCISFiling = require('../../models/USCISFiling');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const { definitions } = require('../staffWorkQueues');
const { accessibleInteractionFilter } = require('../interactionPolicy');
const { ACTIVE_UNANSWERED_STATUSES } = require('../../utils/interactionConstants');
const { can } = require('../../utils/permissions');
const { caseLabels } = require('./shared');
const { ReportInputError } = require('./context');

const ROW_LIMIT = 100;

/** Queue order and which Dashboard definition (if any) each reuses. */
const QUEUES = [
  { key: 'document_review', reuse: true },
  { key: 'documents_quarantined', label: 'Quarantined documents', capability: 'documents.review', model: CaseDocument, tab: 'documents', match: { status: 'quarantined', archivedAt: null } },
  { key: 'document_requests', reuse: true },
  { key: 'missing_evidence', reuse: true },
  { key: 'forms_review', reuse: true },
  { key: 'forms_needs_changes', label: 'Forms needing changes', capability: 'forms.review', model: CaseSmartForm, tab: 'forms', match: { status: 'needs_changes' } },
  { key: 'petition_review', reuse: true },
  { key: 'petitions_needs_changes', label: 'Petitions needing changes', capability: 'petitions.review', model: CasePetition, tab: 'petition', match: { status: 'needs_changes' } },
  { key: 'packet_review', reuse: true },
  { key: 'packets_needs_changes', label: 'Filing packets needing changes', capability: 'filing_packets.review', model: FilingPacket, tab: 'packet', match: { status: 'needs_changes' } },
  { key: 'uscis_action_required', label: 'USCIS action required', capability: 'uscis_tracking.view', model: USCISFiling, tab: 'tracking', match: { archivedAt: null, actionRequired: true } },
  { key: 'queries_unanswered', label: 'Unanswered queries', capability: 'queries.view', model: ConsultationInteraction, tab: null, interaction: true, match: { status: { $in: ACTIVE_UNANSWERED_STATUSES } } },
  { key: 'queries_overdue', label: 'Queries past their response date', capability: 'queries.view', model: ConsultationInteraction, tab: null, interaction: true, match: () => ({ status: { $in: ACTIVE_UNANSWERED_STATUSES }, responseDueAt: { $ne: null, $lt: new Date() } }) },
];
const QUEUE_KEYS = QUEUES.map((q) => q.key);

async function run(req, ctx, query = {}) {
  let keys = QUEUE_KEYS;
  if (query.source !== undefined && query.source !== '') {
    if (!QUEUE_KEYS.includes(query.source)) throw new ReportInputError('source', `source must be one of: ${QUEUE_KEYS.join(', ')}.`);
    keys = [query.source];
  }
  const dashboard = Object.fromEntries(definitions(req).map((d) => [d.key, d]));
  const interactionAccess = can(req, 'queries.view') ? await accessibleInteractionFilter(req) : null;

  const resolved = QUEUES.filter((q) => keys.includes(q.key)).map((q) => {
    const def = q.reuse ? dashboard[q.key] : can(req, q.capability) ? { ...q } : null;
    const label = q.label || (def && def.label);
    return { q, def, label };
  });

  const results = await Promise.all(
    resolved.map(async ({ q, def, label }) => {
      if (!def || !ctx.canCases) return { key: q.key, label: label || q.key.replace(/_/g, ' '), available: false, count: null, rows: [], rowsTotal: 0 };
      const match = typeof def.match === 'function' ? def.match() : def.match; // evaluated per request, never frozen at load time
      const base = q.interaction ? { $and: [interactionAccess, match, ...(ctx.narrowed ? [ctx.caseCond('case')] : [])] } : { ...match, ...ctx.caseCond('case') };
      const grouped = await def.model.aggregate([{ $match: base }, { $group: { _id: '$case', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]);
      return { key: q.key, label, available: true, tab: def.tab, grouped };
    }),
  );

  const labels = await caseLabels(results.flatMap((r) => (r.grouped || []).map((g) => g._id)));
  const queues = results.map((r) => {
    if (!r.available) return r;
    const all = r.grouped.map((g) => {
      const c = g._id ? labels.get(String(g._id)) : null;
      return {
        caseId: g._id ? String(g._id) : null,
        caseNumber: c ? c.caseNumber : null,
        caseTitle: g._id ? (c ? c.title : 'Unavailable case') : 'Not on a case yet',
        count: g.count,
        link: g._id ? { path: `/cases/${g._id}`, queryParams: r.tab ? { tab: r.tab } : {} } : { path: '/consultations', queryParams: {} },
      };
    });
    return { key: r.key, label: r.label, available: true, count: all.reduce((n, row) => n + row.count, 0), rows: all.slice(0, ROW_LIMIT), rowsTotal: all.length, all };
  });

  const table = {
    columns: [{ key: 'queue', label: 'Queue' }, { key: 'caseNumber', label: 'Case number' }, { key: 'caseTitle', label: 'Case title' }, { key: 'count', label: 'Count' }],
    rows: queues.filter((q) => q.available).flatMap((q) => q.all.map((r) => ({ queue: q.label, caseNumber: r.caseNumber || '', caseTitle: r.caseTitle, count: r.count }))),
  };
  return { data: { snapshot: { queues: queues.map(({ all, ...rest }) => rest), rowLimit: ROW_LIMIT } }, table };
}

module.exports = { run, QUEUE_KEYS };
