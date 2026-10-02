/**
 * Staff API: initial password setup for first-login employees.
 *
 * Security model (ADR-016):
 * - employee must present their temporary credential on setup
 * - new password minimum 12 characters
 * - hash is stored via pre-save hook; save() is safe here (we are intentionally
 *   using the hook to hash the new password)
 * - all existing sessions are revoked after the change
 * - a fresh normal EmployeeSession is issued
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const AdminUser = require('../../../../models/admin/User');
const EmployeeSession = require('../../../../models/EmployeeSession');
const { createApiError } = require('../../../../middleware/api/apiError');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const {
  staffAuthMiddleware,
  EMPLOYEE_SESSION_COOKIE_NAME,
  hashToken,
} = require('../../../../middleware/api/staffAuth');
const { recordSecurityEvent } = require('../../../../utils/securityEvents');

const MIN_PASSWORD_LENGTH = 12;

router.post('/initial-password', trustedOriginMiddleware, staffAuthMiddleware, async (req, res, next) => {
  try {
    const user = req.staff;

    if (!user.mustChangePassword) {
      return next(createApiError(400, 'invalid_input', 'Password change is not required for this account.'));
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(createApiError(400, 'invalid_input', 'Current password and new password are required.'));
    }

    if (newPassword !== confirmPassword) {
      return next(createApiError(400, 'invalid_input', null, [
        { field: 'confirmPassword', message: 'Passwords do not match.' },
      ]));
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return next(createApiError(400, 'invalid_input', null, [
        { field: 'newPassword', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      ]));
    }

    if (newPassword === currentPassword) {
      return next(createApiError(400, 'invalid_input', null, [
        { field: 'newPassword', message: 'New password must differ from the current temporary password.' },
      ]));
    }

    // Re-read the user document so we have the current password hash
    const userDoc = await AdminUser.findById(user._id);
    if (!userDoc) {
      return next(createApiError(401, 'unauthenticated', 'Account not found.'));
    }

    const isMatch = await bcrypt.compare(currentPassword, userDoc.password);
    if (!isMatch) {
      return next(createApiError(401, 'unauthenticated', 'Invalid current password.'));
    }

    // Set new password — the pre-save bcrypt hook hashes it
    userDoc.password = newPassword;
    userDoc.mustChangePassword = false;
    userDoc.passwordChangedAt = new Date();
    await userDoc.save();

    await recordSecurityEvent({
      type: 'password_changed',
      result: 'success',
      surface: 'staff',
      actorType: 'admin_user',
      actorAdminId: user._id,
      actorName: user.name || '',
      req,
    });

    // Revoke ALL existing sessions (including the temporary-password bootstrap session)
    await EmployeeSession.deleteMany({ adminUser: user._id });

    // Issue a fresh normal employee session
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    await EmployeeSession.create({
      adminUser: userDoc._id,
      tokenHash: hashToken(token),
      roleSnapshot: userDoc.role,
      expiresAt: new Date(now + 1000 * 60 * 60 * 12),
      idleExpiresAt: new Date(now + 1000 * 60 * 60 * 2),
      createdIp: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    const isSecure = process.env.NODE_ENV === 'production';
    const cookieOpts = [
      `${EMPLOYEE_SESSION_COOKIE_NAME}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${60 * 60 * 12}`,
    ];
    if (isSecure) cookieOpts.push('Secure');
    res.setHeader('Set-Cookie', cookieOpts.join('; '));

    res.json({ data: { success: true }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
