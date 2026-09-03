const crypto = require('crypto');
const { recordSecurityEvent, actorFromSession } = require('../utils/securityEvents');

/**
 * Synchroniser-token CSRF protection for the admin CMS (ADR-012 §5).
 *
 * Until this existed the admin was protected only by `sameSite: 'lax'` on
 * the session cookie — a mitigation, not a control: `lax` still permits
 * top-level cross-site POSTs in some browser and redirect paths, and it is
 * one cookie-policy change away from being nothing at all. Every
 * state-changing admin action (deleting a lead, disabling a client, adding
 * a user) was reachable that way.
 *
 * The two Next.js applications use Origin verification instead
 * (src/lib/auth/csrf.ts). They can: every mutating request there is a
 * `fetch` issued by their own JavaScript, which always carries `Origin`.
 * This app posts real HTML forms, where `Origin` is not reliably present
 * across the browsers and redirect chains an admin has to work in, so it
 * needs a token the form itself carries. Two mechanisms, chosen per
 * application because the request shapes genuinely differ — ADR-012 §5
 * records why that is not an inconsistency to "fix".
 *
 * ## What is verified, and what deliberately is not
 *
 * Verification applies to an **authenticated** state-changing request, plus
 * `POST /admin/login` (login CSRF — forcing a victim into an attacker's
 * session — is a real attack, and the login form is the one mutating route
 * outside `requireAdmin`).
 *
 * An unauthenticated request to any other route is left alone, because it
 * cannot change anything: every other `/admin/*` route sits behind
 * `requireAdmin`, which redirects it to the login page. Rejecting it here
 * instead would replace that redirect with a dead-end 403 for the ordinary
 * case of an admin whose session expired while a form was open.
 *
 * ## Ordering constraint
 *
 * The token arrives in `req.body._csrf`, so verification MUST run after a
 * body parser. For `application/x-www-form-urlencoded` that is
 * `express.urlencoded`, mounted globally before this. For
 * `multipart/form-data` the parser is multer, mounted *per route* — so
 * multipart requests are deferred here and verified by `verifyCsrf` after
 * multer runs. `middleware/upload.js` composes the two so a route cannot
 * acquire file uploads without also acquiring verification, and
 * test/csrf.test.js asserts every mutating route rejects a tokenless
 * request, which is what catches a route escaping both.
 */

const TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOGIN_PATH = '/admin/login';

function issueToken(session) {
  if (!session.csrfToken) {
    session.csrfToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  }
  return session.csrfToken;
}

function tokensMatch(expected, presented) {
  if (typeof expected !== 'string' || typeof presented !== 'string') return false;
  if (!expected || !presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  // timingSafeEqual throws on a length mismatch, so compare lengths first —
  // the token's length is not a secret.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * The header form is accepted alongside the hidden field. A cross-site HTML
 * form cannot set custom headers at all, and a cross-origin XHR that tries
 * triggers a CORS preflight this app never answers — so it is an equally
 * safe channel, and the one the test agent uses.
 */
function presentedToken(req) {
  return (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
}

/** True when this request could actually change state if it were let through. */
function needsVerification(req) {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.session && req.session.isAdmin) return true;
  return req.path === LOGIN_PATH;
}

function reject(req, res) {
  // Fire-and-forget: recordSecurityEvent never throws or rejects, and the
  // refusal must not wait on a database write.
  recordSecurityEvent({
    type: 'csrf_rejected',
    result: 'denied',
    surface: 'admin_cms',
    req,
    meta: { path: req.originalUrl, method: req.method },
    ...actorFromSession(req.session),
  });

  return res.status(403).send(
    'Your session has expired or the request could not be verified. ' +
      '<a href="/admin">Go back to the admin</a> and try again.'
  );
}

/**
 * Global middleware: issues the token for every view, and verifies every
 * state-changing request whose body has already been parsed.
 */
function csrfProtection(req, res, next) {
  // Always define the local, even with no session — every admin view now
  // renders `csrfToken`, and an undefined EJS local is a ReferenceError,
  // not an empty string.
  if (!req.session) {
    res.locals.csrfToken = '';
    return next();
  }

  res.locals.csrfToken = issueToken(req.session);

  if (!needsVerification(req)) return next();

  // Deferred to verifyCsrf, which runs after multer has populated req.body.
  if (req.is('multipart/form-data')) {
    req.csrfPending = true;
    return next();
  }

  if (!tokensMatch(req.session.csrfToken, presentedToken(req))) {
    return reject(req, res);
  }

  return next();
}

/** Post-multer verification for multipart routes. */
function verifyCsrf(req, res, next) {
  req.csrfPending = false;

  if (!req.session) return next();
  if (!needsVerification(req)) return next();

  if (!tokensMatch(req.session.csrfToken, presentedToken(req))) {
    return reject(req, res);
  }

  return next();
}

module.exports = { csrfProtection, verifyCsrf };
