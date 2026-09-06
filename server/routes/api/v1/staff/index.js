/**
 * Staff API router — mounts all /api/v1/staff/* sub-routers.
 *
 * Security model:
 * - /session and /account/initial-password are accessible to employees with
 *   mustChangePassword=true (needed to set up the permanent credential)
 * - All other routes require a fully initialized employee session
 *   (mustChangePassword must be false)
 */
const express = require('express');
const router = express.Router();

const {
  staffAuthMiddleware,
  requirePasswordSetupComplete,
} = require('../../../../middleware/api/staffAuth');

// These routes handle their own auth inside their handlers:
// - session/login: no prior auth needed
// - session/logout: staffAuthMiddleware applied inside
// - account/initial-password: staffAuthMiddleware applied inside but
//   must NOT gate behind requirePasswordSetupComplete
router.use('/session', require('./session'));
router.use('/account', require('./account'));

// /me is allowed to mustChangePassword users so Angular can read the flag
router.use('/me', require('./me'));

// All remaining routes require a fully set-up employee session
router.use(staffAuthMiddleware, requirePasswordSetupComplete);

router.use('/dashboard', require('./dashboard'));
router.use('/cases', require('./cases'));
router.use('/cases/:caseId', require('./case-mutations'));
router.use('/clients', require('./clients'));
router.use('/tasks', require('./tasks'));

module.exports = router;
