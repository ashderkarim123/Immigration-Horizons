/**
 * Authorized federated Staff search (ADR-028). An orchestrator over the real collections: no search index, no search collection,
 * no background pipeline. For each source the actor may search it applies the source's own capability and row scope inside the
 * query, ranks deterministically, and returns an explicit safe DTO. Angular is never the authorization boundary.
 *
 * Failure behavior (documented choice "B"): a quick, multi-source search that loses one source still returns the others and
 * lists the failed source in `unavailableTypes`, so a failure is never silently shown as "0 matches"; a single-source
 * (full results) search that fails fails the request. Nothing here logs the query text: only its length, source names,
 * durations and counts.
 */
const ClientCase = require('../../models/ClientCase');
const { can } = require('../../utils/permissions');
const { parseQuery, rankedSearch, matchOf } = require('./engine');
const { SOURCES, SOURCE_TYPES, asId } = require('./sources');

const QUICK_PER_SOURCE_DEFAULT = 5;
const QUICK_PER_SOURCE_MAX = 10;
const FULL_PAGE_DEFAULT = 25;
const FULL_PAGE_MAX = 50;
const MAX_PAGE = 200;
const SOURCE_TIMEOUT_MS = 8000;

class SearchInputError extends Error {
  constructor(field, message, status = 422) {
    super(message);
    this.field = field;
    this.status = status;
  }
}

/** The source types this actor may search right now (capability gate; row scope is applied per query). */
const availableTypes = (req) => SOURCE_TYPES.filter((t) => !SOURCES[t].capability || can(req, SOURCES[t].capability));
const describe = (types) => types.map((type) => ({ type, label: SOURCES[type].label }));

const intIn = (raw, def, min, max, field) => {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new SearchInputError(field, `${field} must be a whole number from ${min} to ${max}.`);
  return n;
};

/** Validates the request. Throws SearchInputError (422) for bad input; the query text is validated, never logged. */
function parseRequest(req, params) {
  const parsed = parseQuery(params.q);
  if (parsed.error) throw new SearchInputError('q', parsed.error);

  const known = (t) => {
    if (!SOURCE_TYPES.includes(t)) throw new SearchInputError('type', `Unknown search type "${t}".`);
    return t;
  };
  const allowed = availableTypes(req);

  if (params.type !== undefined && params.type !== '') {
    const type = known(String(params.type));
    // Asking for a source the actor cannot search is a refusal, never a silent widening or an empty "no matches".
    if (!allowed.includes(type)) throw new SearchInputError('type', 'You cannot search that type.', 403);
    return {
      q: parsed.q,
      mode: 'single',
      types: [type],
      page: intIn(params.page, 1, 1, MAX_PAGE, 'page'),
      limit: intIn(params.limit, FULL_PAGE_DEFAULT, 1, FULL_PAGE_MAX, 'limit'),
    };
  }

  const requested = params.types ? String(params.types).split(',').map((t) => known(t.trim())).filter(Boolean) : allowed;
  return {
    q: parsed.q,
    mode: 'quick',
    types: requested.filter((t) => allowed.includes(t)),
    page: 1,
    limit: intIn(params.limit, QUICK_PER_SOURCE_DEFAULT, 1, QUICK_PER_SOURCE_MAX, 'limit'),
  };
}

async function searchSource(req, type, { q, page, limit }) {
  const source = SOURCES[type];
  const started = Date.now();
  const scope = await source.scope(req, q);
  const { rows, hasMore } = await rankedSearch(source.model, {
    scope,
    fields: source.fields,
    computed: source.computed,
    project: source.project,
    q,
    skip: (page - 1) * limit,
    limit,
    maxTimeMS: SOURCE_TIMEOUT_MS,
    textInScope: !!source.textInScope,
  });
  return { type, rows, hasMore, ms: Date.now() - started };
}

/** One batched case lookup for every result, so the response never costs a query per row. */
async function caseLabels(groups) {
  const ids = new Set();
  for (const g of groups) for (const row of g.rows) {
    const id = asId(SOURCES[g.type].caseOf(row));
    if (id) ids.add(id);
  }
  if (!ids.size) return new Map();
  const cases = await ClientCase.find({ _id: { $in: [...ids] } }).select('caseNumber title').lean();
  return new Map(cases.map((c) => [String(c._id), { id: String(c._id), caseNumber: c.caseNumber, title: c.title }]));
}

function toResult(type, row, q, cases) {
  const source = SOURCES[type];
  const body = source.dto(row);
  const caseId = asId(source.caseOf(row));
  return {
    type,
    id: String(row._id),
    title: body.title,
    subtitle: body.subtitle || null,
    statusLabel: body.statusLabel || null,
    case: caseId ? cases.get(caseId) || null : null,
    context: body.context || [],
    updatedAt: row.updatedAt || null,
    href: body.href,
    match: matchOf(row, source.fields, q, source.fallbackField),
  };
}

/** Runs a validated search; returns `{ data, unavailableTypes }`. */
async function runSearch(req, params) {
  const request = parseRequest(req, params);
  const settled = await Promise.all(
    request.types.map((type) =>
      searchSource(req, type, request).then(
        (ok) => ({ ok }),
        (error) => ({ failed: type, error }),
      ),
    ),
  );

  const unavailableTypes = settled.filter((s) => s.failed).map((s) => s.failed);
  // A full-results search for one source must not pretend: a failed source fails the request.
  if (request.mode === 'single' && unavailableTypes.length) {
    const failure = settled.find((s) => s.failed);
    logSearch(req, request, settled);
    throw failure.error;
  }

  const groups = settled.filter((s) => s.ok).map((s) => s.ok);
  const cases = await caseLabels(groups);
  logSearch(req, request, settled);

  const data = {
    groups: groups.map((g) => ({
      type: g.type,
      label: SOURCES[g.type].label,
      items: g.rows.map((row) => toResult(g.type, row, request.q, cases)),
      hasMore: g.hasMore,
    })),
    availableTypes: describe(availableTypes(req)),
    ...(request.mode === 'single' ? { page: request.page, pageSize: request.limit } : {}),
  };
  return { data, unavailableTypes };
}

/** Safe telemetry: request id, query LENGTH, source names, durations, counts, failed sources. Never the text itself. */
function logSearch(req, request, settled) {
  const durations = {};
  const counts = {};
  for (const s of settled) {
    if (s.ok) {
      durations[s.ok.type] = s.ok.ms;
      counts[s.ok.type] = s.ok.rows.length;
    }
  }
  if (process.env.SEARCH_TELEMETRY_SILENT === '1') return;
  console.info('[search]', JSON.stringify({ requestId: req.id, mode: request.mode, queryLength: [...request.q].length, types: request.types, durations, counts, failed: settled.filter((s) => s.failed).map((s) => ({ type: s.failed, code: (s.error && (s.error.code || s.error.name)) || 'error' })) }));
}

module.exports = { runSearch, availableTypes, describe, SearchInputError, SOURCE_TYPES, QUICK_PER_SOURCE_MAX, FULL_PAGE_MAX };
