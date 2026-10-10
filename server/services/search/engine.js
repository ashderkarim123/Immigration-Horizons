/**
 * Search primitives for the federated Staff search (ADR-028). No index, no search collection: each source adapter runs one
 * bounded aggregation over its own authoritative collection, with the actor's row scope as the FIRST $match so unauthorized
 * rows are never read, ranked, counted or returned.
 *
 * The user's text is only ever a literal: regex metacharacters are escaped before it reaches a pattern.
 */
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Trimmed text of 2..80 visible characters with no control characters, or an error message. */
function parseQuery(raw) {
  if (typeof raw !== 'string') return { error: 'Enter something to search for.' };
  const q = raw.trim();
  const length = [...q].length;
  if (length < MIN_QUERY_LENGTH) return { error: `Search needs at least ${MIN_QUERY_LENGTH} characters.` };
  if (length > MAX_QUERY_LENGTH) return { error: `Search can be at most ${MAX_QUERY_LENGTH} characters.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(q)) return { error: 'Search cannot contain control characters.' };
  return { q };
}

// Rank (lower is better): 0 exact identifier, 1 identifier prefix, 2 name/title (exact or prefix), 3 literal text match.
const RANK = { identifierExact: 0, identifierPrefix: 1, name: 2, text: 3, none: 99 };

const fieldQuery = (field, q) => (field.normalize ? field.normalize(q) || q : q);

function rankExpression(field, q) {
  const e = escapeRegex(fieldQuery(field, q));
  const matches = (regex) => ({
    $regexMatch: { input: { $convert: { input: `$${field.path}`, to: 'string', onError: '', onNull: '' } }, regex, options: 'i' },
  });
  return {
    $cond: [
      matches(`^${e}$`),
      field.identifier ? RANK.identifierExact : RANK.name,
      { $cond: [matches(`^${e}`), field.identifier ? RANK.identifierPrefix : RANK.name, { $cond: [matches(e), RANK.text, RANK.none] }] },
    ],
  };
}

/**
 * One source's ranked page. `scope` is the actor's row filter ({} = unrestricted). `fields` is [{ path, identifier?, normalize?,
 * label }]; `computed` adds derived string fields (e.g. a full name) before matching. Returns up to `limit` rows plus `hasMore`
 * (fetching limit+1, never an exact total).
 */
async function rankedSearch(Model, { scope, fields, computed, project, q, skip = 0, limit, maxTimeMS, textInScope = false }) {
  const textMatch = { $or: fields.map((f) => ({ [f.path]: { $regex: escapeRegex(fieldQuery(f, q)), $options: 'i' } })) };
  const pipeline = [
    { $match: scope || {} },
    ...(computed ? [{ $addFields: computed }] : []),
    ...(textInScope ? [] : [{ $match: textMatch }]),
    { $addFields: { _rank: { $min: fields.map((f) => rankExpression(f, q)) } } },
    { $sort: { _rank: 1, updatedAt: -1, _id: 1 } },
    { $skip: skip },
    { $limit: limit + 1 },
    { $project: project },
  ];
  const aggregate = Model.aggregate(pipeline);
  if (maxTimeMS) aggregate.option({ maxTimeMS });
  const rows = await aggregate;
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Which field matched best, and how, evaluated in Node over the (at most 51) rows already selected. */
function matchOf(row, fields, q, fallbackField) {
  let best = null;
  for (const f of fields) {
    const needle = fieldQuery(f, q).toLowerCase();
    const raw = row[f.path];
    const value = raw === null || raw === undefined ? '' : String(raw).toLowerCase();
    let rank = RANK.none;
    let quality = 'text';
    if (value === needle) {
      rank = f.identifier ? RANK.identifierExact : RANK.name;
      quality = 'exact';
    } else if (value.startsWith(needle)) {
      rank = f.identifier ? RANK.identifierPrefix : RANK.name;
      quality = 'prefix';
    } else if (value.includes(needle)) {
      rank = RANK.text;
    }
    if (rank < RANK.none && (!best || rank < best.rank)) best = { rank, field: f.label, quality };
  }
  return best ? { field: best.field, quality: best.quality } : { field: fallbackField || fields[0].label, quality: 'text' };
}

module.exports = { MIN_QUERY_LENGTH, MAX_QUERY_LENGTH, escapeRegex, parseQuery, rankedSearch, matchOf };
