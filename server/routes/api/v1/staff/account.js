const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const AdminUser = require('../../../../models/admin/User');
const EmployeeSession = require('../../../../models/EmployeeSession');
const { createApiError } = require('../../../../middleware/api/apiError');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { staffAuthMiddleware, EMPLOYEE_SESSION_COOKIE_NAME, hashToken } = require('../../../../middleware/api/staffAuth');
const { recordSecurityEvent } = require('../../../../utils/securityEvents');
const crypto = require('crypto');

router.post('/initial-password', trustedOriginMiddleware, staffAuthMiddleware, async (req, res, next) => {
  try {
    const user = req.staff;
    if (!user.mustChangePassword) {
      return next(createApiError(400, 'invalid_input', 'Password change is not required for this account'));
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(createApiError(400, 'invalid_input', 'Current and new password are required'));
    }

    if (newPassword.length < 8) {
      return next(createApiError(400, 'invalid_input', 'New password must be at least 8 characters long'));
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return next(createApiError(401, 'unauthenticated', 'Invalid current password'));
    }

    // Update password
    const userDoc = await AdminUser.findById(user._id);
    userDoc.password = newPassword; // Pre-save hook hashes it
    userDoc.mustChangePassword = false;
    userDoc.passwordChangedAt = new Date();
    await userDoc.save();

    await recordSecurityEvent({
      type: 'password_changed',
      result: 'success',
      surface: 'staff_api',
      actorType: 'admin_user',
      actorAdminId: user._id,
      req
    });

    // Revoke all existing sessions including current one
    await EmployeeSession.deleteMany({ adminUser: user._id });

    // Issue fresh session
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    
    await EmployeeSession.create({
      adminUser: user._id,
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
      `Max-Age=${60 * 60 * 12}`
    ];
    if (isSecure) cookieOpts.push('Secure');

    res.setHeader('Set-Cookie', cookieOpts.join('; '));

    res.json({
      data: { success: true },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
