/**
 * Trusted Origin CSRF defense for the staff API.
 * Ensures state-mutating requests come from a recognized Immigration Horizons
 * origin (ADR-016 security model).
 *
 * Fix: the previous implementation used `host.endsWith('immigrationhorizons.com')`
 * which accepts 'evilimmigrationhorizons.com'. Now we require either the
 * exact apex domain or a dot-prefixed subdomain.
 */
const { createApiError } = require('./apiError');
const { recordSecurityEvent } = require('../../utils/securityEvents');

function isTrustedHost(host) {
  if (!host) return false;
  // Exact apex or any proper subdomain (dot-separated prefix)
  return (
    host === 'immigrationhorizons.com' ||
    host.endsWith('.immigrationhorizons.com') ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    // Allow any localhost port for dev (e.g. "localhost:4200" is handled by URL parsing below)
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:')
  );
}

async function trustedOriginMiddleware(req, res, next) {
  // Safe methods never carry CSRF risk
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;

  if (!origin) {
    await recordSecurityEvent({
      type: 'csrf_rejected',
      result: 'denied',
      surface: 'staff',
      actorType: 'anonymous',
      req,
      meta: { reason: 'missing_origin' },
    });
    return next(createApiError(403, 'forbidden', 'Missing Origin header.'));
  }

  let trusted = false;
  try {
    const originUrl = new URL(origin);
    trusted = isTrustedHost(originUrl.hostname);
  } catch {
    // Malformed origin URL — not trusted
  }

  if (!trusted) {
    await recordSecurityEvent({
      type: 'csrf_rejected',
      result: 'denied',
      surface: 'staff',
      actorType: 'anonymous',
      req,
      meta: { reason: 'untrusted_origin', origin: String(origin).slice(0, 200) },
    });
    return next(createApiError(403, 'forbidden', 'Untrusted origin.'));
  }

  return next();
}

module.exports = { trustedOriginMiddleware, isTrustedHost };
