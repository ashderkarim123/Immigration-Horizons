/**
 * Authentication, authorization and CSRF for the JSON Admin API (ADR-029).
 *
 * Identity is the CMS express-session and nothing else: this router is mounted after express-session and never reads
 * the `ih_staff_session` or `ih_portal_session` cookies. Every protected request re-reads the AdminUser, so a
 * demotion or deactivation takes effect on the next call. The environment break-glass session (no AdminUser id) is
 * refused here on purpose — it stays an EJS-only recovery path, because every Admin API action must be attributable.
 */
const AdminUser = require('../../models/admin/User');
const { can, CAPABILITIES, ROLE_LABELS } = require('../../utils/permissions');
const { recordSecurityEvent, actorFromSession } = require('../../utils/securityEvents');
const { issueToken, tokensMatch } = require('../csrf');
const { createApiError } = require('./apiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A mutation is trusted only from the origin that served the console: the request's own host, or the configured
 * ADMIN_URL. Outside production any localhost port is also accepted, for `ng serve` behind its dev proxy.
 */
function isTrustedAdminOrigin(origin, host, env = process.env) {
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (host && url.host === host) return true;
  if (env.ADMIN_URL) {
    try { if (new URL(env.ADMIN_URL).origin === url.origin) return true; } catch { /* a bad ADMIN_URL trusts nothing */ }
  }
  return env.NODE_ENV !== 'production' && LOCAL_HOSTS.has(url.hostname);
}

function rejectCsrf(req, reason) {
  // Fire-and-forget: the recorder never rejects, and the refusal must not wait on a database write.
  recordSecurityEvent({ type: 'csrf_rejected', result: 'denied', surface: 'admin_cms', req, meta: { reason, method: req.method }, ...actorFromSession(req.session) });
  return createApiError(403, 'csrf_invalid', 'This request could not be verified. Reload the page and try again.');
}

/**
 * Synchroniser token (the same session token the EJS forms carry) in `X-CSRF-Token`, plus a same-origin check. The
 * token travels in a header, so a multipart upload is verified before multer touches the disk.
 */
function adminCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next(rejectCsrf(req, 'missing_origin'));
  if (!isTrustedAdminOrigin(origin, req.get('host'))) return next(rejectCsrf(req, 'untrusted_origin'));
  if (!req.session || !tokensMatch(req.session.csrfToken, req.get('x-csrf-token') || '')) return next(rejectCsrf(req, 'bad_token'));
  return next();
}

/** The live account behind a CMS session, or null. Never trusts the role snapshot stored in the session. */
async function liveAdmin(session) {
  const snapshot = session && session.isAdmin ? session.adminUser : null;
  if (!snapshot || !snapshot.id) return null; // no session, or the break-glass session
  const user = await AdminUser.findById(snapshot.id).select('name email role isActive jobTitle department').lean();
  return user && user.isActive && can({ staff: user }, 'admin.cms.access') ? user : null;
}

async function requireAdminSession(req, res, next) {
  try {
    const user = await liveAdmin(req.session);
    if (!user) {
      const named = req.session && req.session.isAdmin && req.session.adminUser && req.session.adminUser.id;
      const deny = () => next(createApiError(401, 'unauthenticated', 'Sign in with your administrator account to continue.'));
      // A named session whose account was deleted, disabled or demoted is dead everywhere. A break-glass session is
      // left intact for the EJS console; it simply is not an Admin API identity.
      return named ? req.session.destroy(deny) : deny();
    }
    req.session.adminUser = { id: String(user._id), name: user.name, role: user.role };
    req.admin = user;
    req.staff = user; // utils/permissions `can(req, …)` reads the live role from here
    return next();
  } catch (error) {
    // A database failure must never turn a stale cookie into authorization.
    return next(error);
  }
}

function requireAdminCapability(capability) {
  return (req, res, next) =>
    (can(req, capability) ? next() : next(createApiError(403, 'forbidden', 'You do not have permission to perform this action.')));
}

function capabilitiesOf(role) {
  return Object.keys(CAPABILITIES).filter((capability) => can({ staff: { role } }, capability));
}

const adminDto = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: { code: user.role, label: ROLE_LABELS[user.role] || user.role },
  jobTitle: user.jobTitle || '',
  department: user.department || '',
  capabilities: capabilitiesOf(user.role),
});

/** Who is acting, for the append-only security log. */
const adminActor = (req) => ({ actorType: 'admin_user', actorAdminId: req.admin._id, actorName: req.admin.name || '' });

module.exports = { adminCsrf, requireAdminSession, requireAdminCapability, liveAdmin, adminDto, adminActor, issueToken, isTrustedAdminOrigin, capabilitiesOf };
