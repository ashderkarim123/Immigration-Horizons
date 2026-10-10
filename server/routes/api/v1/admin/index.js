/**
 * Admin API router — /api/v1/admin/* (ADR-029).
 *
 * Mounted AFTER express-session (it needs the CMS session) and BEFORE the legacy EJS CSRF middleware. The Staff API
 * stays mounted before express-session, so neither identity can reach the other's routes.
 */
const express = require('express');
const { requestIdMiddleware } = require('../../../../middleware/api/requestId');
const { apiErrorHandler, createApiError } = require('../../../../middleware/api/apiError');
const { adminCsrf, requireAdminSession, adminDto } = require('../../../../middleware/api/adminAuth');

const router = express.Router();

router.use(requestIdMiddleware);
// Administrative data, and once a one-time credential: never cached by a browser or a proxy.
router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
});

router.use('/session', require('./session'));

// Everything below needs a live, named administrator; mutations also need the session CSRF token and a trusted origin.
router.use(requireAdminSession, adminCsrf);

router.get('/me', (req, res) => res.json({ data: adminDto(req.admin), meta: { requestId: req.id } }));

router.use((req, res, next) => next(createApiError(404, 'not_found', 'Not found.')));
router.use(apiErrorHandler);

module.exports = router;
