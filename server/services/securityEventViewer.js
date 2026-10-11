/**
 * Read side of the append-only security log for the Admin Console (ADR-029). There is no write path here and never
 * will be: `security_events` refuses updates and deletes at the model layer.
 *
 * The DTO is an allowlist, not a dump. `meta` is free-form at write time (denylist-filtered), so on the way out only
 * the keys registered for that event type are returned — an unknown key from a future call site is dropped, not shown.
 */
const mongoose = require('mongoose');
const SecurityEvent = require('../models/SecurityEvent');
const { invalid, notFound, isId, pageParams } = require('./cms/common');

const MAX_RANGE_DAYS = 400; // the retention period; nothing older exists to ask for
const MAX_OFFSET = 10000;

const ADMIN_ACTION_KEYS = ['action', 'role', 'changed', 'count'];
const SAFE_META_KEYS = {
  login_succeeded: ['role', 'reason', 'via', 'action'],
  login_failed: ['reason', 'via', 'locked'],
  account_locked: ['lockedUntil'],
  logout: ['reason'],
  session_revoked: ['action', 'reason', 'count'],
  permission_denied: ['reason', 'role', 'capability'],
  csrf_rejected: ['reason', 'method'],
  password_reset_completed: ['action'],
  report_exported: ['report', 'scope', 'from', 'to', 'rowCount'],
  admin_user_created: ADMIN_ACTION_KEYS,
  admin_user_updated: ADMIN_ACTION_KEYS,
  admin_user_deleted: ADMIN_ACTION_KEYS,
  admin_credentials_reset: ADMIN_ACTION_KEYS,
  admin_staff_sessions_revoked: ADMIN_ACTION_KEYS,
  admin_content_mutated: ['resourceType', 'resourceId', 'action'],
  admin_settings_updated: ['group', 'keys'],
};
const DEFAULT_META_KEYS = ['reason', 'action'];
const isPrimitive = (value) => ['string', 'number', 'boolean'].includes(typeof value);

function safeMeta(type, meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const key of SAFE_META_KEYS[type] || DEFAULT_META_KEYS) {
    const value = meta[key];
    if (isPrimitive(value)) out[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    else if (Array.isArray(value)) out[key] = value.filter(isPrimitive).slice(0, 30).map((v) => (typeof v === 'string' ? v.slice(0, 80) : v));
  }
  return out;
}

/** Enough to recognise a network, not enough to be the address: 203.0.113.x, or the first three IPv6 groups. */
function maskIp(ip) {
  const value = String(ip || '').replace(/^::ffff:/i, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return `${value.split('.').slice(0, 3).join('.')}.x`;
  if (value.includes(':')) return `${value.split(':').filter(Boolean).slice(0, 3).join(':')}:…`;
  return '';
}

const toDto = (event) => ({
  id: String(event._id),
  type: event.type,
  result: event.result,
  surface: event.surface,
  actorType: event.actorType,
  actorAdmin: event.actorAdmin ? { id: String(event.actorAdmin) } : null,
  actorName: event.actorName || '',
  subjectEmail: event.subjectEmail || '',
  ipMasked: maskIp(event.ip),
  createdAt: event.createdAt,
  meta: safeMeta(event.type, event.meta),
});

const FILTER_ENUMS = { type: SecurityEvent.SECURITY_EVENT_TYPES, result: SecurityEvent.SECURITY_EVENT_RESULTS, surface: SecurityEvent.SECURITY_EVENT_SURFACES, actorType: SecurityEvent.SECURITY_EVENT_ACTOR_TYPES };

function buildFilter(query) {
  const filter = {};
  const errors = {};
  for (const [key, allowed] of Object.entries(FILTER_ENUMS)) {
    if (query[key] === undefined || query[key] === '') continue;
    if (allowed.includes(query[key])) filter[key] = query[key];
    else errors[key] = `${key} is not a recognised value.`;
  }
  if (query.actorAdminId) {
    if (isId(String(query.actorAdminId))) filter.actorAdmin = new mongoose.Types.ObjectId(String(query.actorAdminId));
    else errors.actorAdminId = 'actorAdminId is not a valid id.';
  }
  // Exact, normalized match only: this is an identifier lookup, not a search across people.
  if (typeof query.subjectEmail === 'string' && query.subjectEmail.trim()) filter.subjectEmail = query.subjectEmail.trim().toLowerCase().slice(0, 254);

  const date = (key) => {
    if (!query[key]) return null;
    const value = new Date(String(query[key]));
    if (Number.isNaN(value.getTime())) { errors[key] = `${key} must be a date.`; return null; }
    return value;
  };
  const from = date('from');
  const to = date('to');
  if (from && to && to < from) errors.to = 'to must not be before from.';
  if (from && to && to - from > MAX_RANGE_DAYS * 86400000) errors.to = `The range may cover at most ${MAX_RANGE_DAYS} days.`;
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

  if (Object.keys(errors).length) throw invalid(errors);
  return filter;
}

/**
 * Newest first. Paged by "is there another page" rather than a total: counting an arbitrary filter over an
 * append-only log is the expensive part, and the viewer does not need it.
 */
async function list(query = {}) {
  const filter = buildFilter(query);
  const paging = pageParams(query, { defaultLimit: 25, maxLimit: 100 });
  if (paging.skip + paging.limit > MAX_OFFSET) throw invalid({ page: 'Narrow the filters or the date range to look further back.' });
  const rows = await SecurityEvent.find(filter).sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit + 1).lean();
  return { items: rows.slice(0, paging.limit).map(toDto), page: paging.page, limit: paging.limit, hasMore: rows.length > paging.limit, filters: FILTER_ENUMS };
}

async function get(id) {
  const event = isId(String(id)) ? await SecurityEvent.findById(id).lean() : null;
  if (!event) throw notFound('Security event');
  return toDto(event);
}

const recent = async (limit = 5) => (await SecurityEvent.find().sort({ createdAt: -1, _id: -1 }).limit(limit).lean()).map(toDto);

module.exports = { list, get, recent, toDto, safeMeta, maskIp, SAFE_META_KEYS, MAX_RANGE_DAYS };
