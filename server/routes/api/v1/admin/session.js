/**
 * Admin Console session endpoints (ADR-029). The cookie is the existing HttpOnly CMS session; the only thing the
 * browser ever holds is the session-bound CSRF token, in memory.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createApiError } = require('../../../../middleware/api/apiError');
const { adminCsrf, liveAdmin, adminDto, issueToken } = require('../../../../middleware/api/adminAuth');
const { authenticateAdmin, sessionIdentity, normalizeEmail } = require('../../../../services/adminAuthentication');
const { recordSecurityEvent } = require('../../../../utils/securityEvents');

const router = express.Router();
const GENERIC_FAILURE = 'Invalid email or password.';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 10, // the same knob as the EJS and Staff logins; tests raise it
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(createApiError(429, 'rate_limited', 'Too many sign-in attempts. Please try again in 15 minutes.')),
});

router.get('/bootstrap', async (req, res, next) => {
  try {
    const user = await liveAdmin(req.session);
    res.json({ data: { authenticated: !!user, csrfToken: issueToken(req.session) }, meta: { requestId: req.id } });
  } catch (error) { next(error); }
});

router.post('/login', loginLimiter, adminCsrf, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw createApiError(422, 'validation_error', 'Email and password are required.');
    }
    const result = await authenticateAdmin({ email, password, req, via: 'admin_api' });
    if (!result.ok) {
      if (result.reason === 'no_such_account') {
        await recordSecurityEvent({
          type: 'login_failed', result: 'failure', surface: 'admin_cms', actorType: 'anonymous', subjectEmail: normalizeEmail(email), req,
          meta: { reason: 'no_such_account', via: 'admin_api' },
        });
      }
      // One message for every refusal: it must not reveal whether the email exists, is locked or lacks CMS access.
      throw createApiError(401, 'unauthenticated', GENERIC_FAILURE);
    }
    // New session id on the privilege change (fixation), which also discards the pre-login CSRF token.
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return next(regenerateError);
      Object.assign(req.session, sessionIdentity(result.user));
      const csrfToken = issueToken(req.session);
      return req.session.save((saveError) =>
        (saveError ? next(saveError) : res.json({ data: { admin: adminDto(result.user), csrfToken }, meta: { requestId: req.id } })));
    });
  } catch (error) { next(error); }
});

router.post('/logout', (req, res, next) => {
  const done = () => res.json({ data: { signedOut: true }, meta: { requestId: req.id } });
  if (!req.session || !req.session.isAdmin) return done(); // nothing to end
  return adminCsrf(req, res, async (csrfError) => {
    if (csrfError) return next(csrfError);
    const adminUser = req.session.adminUser || {};
    await recordSecurityEvent({
      type: 'logout', result: 'success', surface: 'admin_cms', req,
      actorType: adminUser.id ? 'admin_user' : 'env_fallback', actorAdminId: adminUser.id || null, actorName: adminUser.name || '',
    });
    return req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('connect.sid');
      return done();
    });
  });
});

module.exports = router;
