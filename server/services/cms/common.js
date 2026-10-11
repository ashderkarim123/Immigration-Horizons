/**
 * Shared plumbing for the CMS/administration services (ADR-029). Each service is the single implementation behind
 * BOTH the legacy EJS route and the JSON Admin API, so validation and business rules cannot drift between them.
 */
const mongoose = require('mongoose');
const { createApiError } = require('../../middleware/api/apiError');
const { recordSecurityEvent, actorFromSession } = require('../../utils/securityEvents');

const invalid = (errors) =>
  createApiError(422, 'validation_error', 'Please correct the highlighted fields.', Object.entries(errors).map(([field, message]) => ({ field, message })));
const notFound = (what) => createApiError(404, 'not_found', `${what} was not found.`);
const conflict = (field, message) => createApiError(409, 'conflict', message, [{ field, message }]);

const isId = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id) && mongoose.Types.ObjectId.isValid(id);
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A literal, case-insensitive, length-bounded search term — never a caller-supplied pattern. */
const searchRegex = (value) => {
  const term = typeof value === 'string' ? value.trim().slice(0, 100) : '';
  return term ? new RegExp(escapeRegex(term), 'i') : null;
};

function pageParams(query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const int = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
  const limit = Math.min(int(query.limit, defaultLimit), maxLimit);
  const page = Math.min(int(query.page, 1), 10000);
  return { page, limit, skip: (page - 1) * limit };
}
const paged = (items, total, { page, limit }) => ({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });

const isHttpUrl = (value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};
/** An absolute http(s) URL, or a root-relative path on this site (e.g. /uploads/x.png). Never `//host` or `javascript:`. */
const isAssetUrl = (value) => isHttpUrl(value) || /^\/(?!\/)[^\s\\<>"']*$/.test(value);

const READERS = {
  text(value, spec) {
    if (value === null || value === undefined) return { value: '' };
    if (typeof value !== 'string' && typeof value !== 'number') return { error: 'must be text.' };
    const text = String(value).trim();
    return spec.max && text.length > spec.max ? { error: `must be ${spec.max} characters or fewer.` } : { value: text };
  },
  bool: (value) => (typeof value === 'boolean' ? { value } : { error: 'must be true or false.' }),
  int(value, spec) {
    if (!Number.isInteger(value)) return { error: 'must be a whole number.' };
    const { min = -1e6, max = 1e6 } = spec;
    return value < min || value > max ? { error: `must be between ${min} and ${max}.` } : { value };
  },
  enum: (value, spec) => (spec.values.includes(value) ? { value } : { error: `must be one of: ${spec.values.join(', ')}.` }),
  url(value, spec) {
    const read = READERS.text(value, { max: spec.max || 2000 });
    if (read.error || read.value === '') return read;
    return (spec.relative ? isAssetUrl(read.value) : isHttpUrl(read.value)) ? read : { error: spec.relative ? 'must be an http(s) URL or a path starting with /.' : 'must be a full http(s) URL.' };
  },
  email(value) {
    const read = READERS.text(value, { max: 254 });
    if (read.error || read.value === '') return read;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(read.value) ? { value: read.value.toLowerCase() } : { error: 'must be a valid email address.' };
  },
  date(value) {
    if (value === null || value === '') return { value: null };
    const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : NaN);
    return Number.isNaN(date.getTime()) ? { error: 'must be a valid date and time.' } : { value: date };
  },
  tags(value, spec) {
    if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) return { error: 'must be a list of text labels.' };
    const tags = [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
    if (tags.length > (spec.maxItems || 20)) return { error: `may have at most ${spec.maxItems || 20} entries.` };
    return tags.some((tag) => tag.length > 40) ? { error: 'entries must be 40 characters or fewer.' } : { value: tags };
  },
};

/**
 * Validates `input` against a field spec. Unknown keys are ignored (never written). With `partial`, only the fields
 * present are read; otherwise absent fields take their `default`, and a missing required field is an error.
 * Spec: { field: { type, label, required?, default?, max?, min?, values?, relative? } }.
 */
function normalize(spec, input, { partial = false } = {}) {
  const values = {};
  const errors = {};
  const source = input && typeof input === 'object' ? input : {};
  for (const [field, rule] of Object.entries(spec)) {
    const present = source[field] !== undefined;
    if (!present) {
      if (partial) continue;
      if (rule.default !== undefined) { values[field] = typeof rule.default === 'function' ? rule.default() : rule.default; continue; }
      if (rule.required) errors[field] = `${rule.label} is required.`;
      continue;
    }
    const read = READERS[rule.type](source[field], rule);
    if (read.error) errors[field] = `${rule.label} ${read.error}`;
    else if (rule.required && (read.value === '' || read.value === null)) errors[field] = `${rule.label} is required.`;
    else values[field] = read.value;
  }
  return { values, errors };
}

/** Who is acting, from either transport: the Admin API's live account or the EJS session (incl. break-glass). */
const contextOf = (req) => ({
  req,
  actor: req.admin
    ? { actorType: 'admin_user', actorAdminId: req.admin._id, actorName: req.admin.name || '' }
    : actorFromSession(req.session),
  role: (req.admin && req.admin.role) || (req.session && req.session.adminUser && req.session.adminUser.role) || null,
  actorId: req.admin ? String(req.admin._id) : (req.session && req.session.adminUser && req.session.adminUser.id ? String(req.session.adminUser.id) : null),
});

/** One audit line per content mutation: what kind, which record, what happened — never the content itself. */
const auditContent = (ctx, resourceType, resourceId, action) =>
  recordSecurityEvent({
    type: 'admin_content_mutated', result: 'success', surface: 'admin_cms', req: ctx.req, ...ctx.actor,
    meta: { resourceType, resourceId: String(resourceId), action },
  });

/** The sentence an EJS form shows for a service error: the first field message, else the error's own. */
const firstMessage = (error) => (error && error.fieldErrors && error.fieldErrors[0] && error.fieldErrors[0].message) || (error && error.message) || 'Something went wrong.';

module.exports = { invalid, notFound, conflict, isId, searchRegex, pageParams, paged, isHttpUrl, isAssetUrl, normalize, contextOf, auditContent, firstMessage };
