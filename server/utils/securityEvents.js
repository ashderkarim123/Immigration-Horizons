const mongoose = require('mongoose');
const SecurityEvent = require('../models/SecurityEvent');

/**
 * Recording side of the security audit log (ADR-012 §2). Mirror of
 * src/lib/security/security-events.ts.
 *
 * Never throws. An audit write failing must not turn a working login into
 * a 500 — the trade-off (lose an entry rather than lock everyone out) is
 * deliberate and recorded in ADR-012 §2. Failures go to stderr so the gap
 * is visible in process logs.
 *
 * `meta` is filtered against a denylist before it is written, so a future
 * careless call site drops a field instead of writing a password into a
 * collection operators query freely.
 */

// Must stay in step with docs/architecture/security-event-contract.json.
const FORBIDDEN_META_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'tokenhash',
  'sessiontoken',
  'csrftoken',
  'secret',
  'authorization',
  'cookie',
]);

const REDACTED = '[redacted]';

/**
 * Shallow by design — nesting a credential inside an object would defeat a
 * one-level scan, so nested objects are dropped rather than walked.
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;

  const clean = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (FORBIDDEN_META_KEYS.has(key.toLowerCase())) {
      clean[key] = REDACTED;
      return;
    }
    if (value === null || value === undefined) return;
    const t = typeof value;
    if (t === 'string') clean[key] = value.slice(0, 500);
    else if (t === 'number' || t === 'boolean') clean[key] = value;
    else if (Array.isArray(value)) {
      clean[key] = value.filter((v) => ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 50);
    }
  });

  return Object.keys(clean).length ? clean : null;
}

/** Same header precedence the Next apps use, so the two agree on "who". */
function requestSecurityContext(req) {
  if (!req) return { ip: '', userAgent: '' };
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
    (req.headers && req.headers['x-real-ip']) ||
    req.ip ||
    '';
  const userAgent = ((req.headers && req.headers['user-agent']) || '').slice(0, 400);
  return { ip: String(ip), userAgent };
}

/**
 * Builds the actor fields from an Express session. The admin CMS's
 * env-credential fallback login has no persistent AdminUser id, so it is
 * recorded as `env_fallback` with no `actorAdmin` rather than being
 * silently attributed to nobody.
 */
function actorFromSession(session) {
  const adminUser = session && session.adminUser;
  if (!adminUser) return { actorType: 'anonymous', actorAdminId: null, actorName: '' };
  if (!adminUser.id) {
    return { actorType: 'env_fallback', actorAdminId: null, actorName: adminUser.name || 'Admin' };
  }
  return { actorType: 'admin_user', actorAdminId: adminUser.id, actorName: adminUser.name || '' };
}

async function recordSecurityEvent(input) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const context = input.req
      ? requestSecurityContext(input.req)
      : { ip: input.ip || '', userAgent: input.userAgent || '' };

    await SecurityEvent.create({
      type: input.type,
      result: input.result,
      surface: input.surface || 'admin_cms',
      actorType: input.actorType,
      actorClient: input.actorClientId || null,
      actorAdmin: input.actorAdminId || null,
      actorName: input.actorName || '',
      subjectEmail: input.subjectEmail || '',
      ip: context.ip,
      userAgent: context.userAgent,
      meta: sanitizeMeta(input.meta),
    });
  } catch (error) {
    // Deliberately swallowed — see the module comment. Never re-thrown.
    console.error('[security-event] failed to record', input && input.type, error && error.message);
  }
}

module.exports = { recordSecurityEvent, sanitizeMeta, requestSecurityContext, actorFromSession };
