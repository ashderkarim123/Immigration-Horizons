const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const AdminUser = require('../../../../models/admin/User');
const EmployeeSession = require('../../../../models/EmployeeSession');
const { createApiError } = require('../../../../middleware/api/apiError');
const { isLockedOut, failedLoginUpdate, successfulLoginUpdate } = require('../../../../utils/lockout');
const { recordSecurityEvent } = require('../../../../utils/securityEvents');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { staffAuthMiddleware, hashToken, EMPLOYEE_SESSION_COOKIE_NAME } = require('../../../../middleware/api/staffAuth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many login attempts.' } }
});

router.post('/login', trustedOriginMiddleware, loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(createApiError(400, 'invalid_input', 'Email and password are required'));
    }

    const subjectEmail = email.trim().toLowerCase();
    const user = await AdminUser.findOne({ email: subjectEmail });

    if (!user) {
      // Constant time protection
      await bcrypt.compare(password, '$2a$12$KIX0Y3FfTMBiP9oV4i1Dcu3h2D5D5zJ9S2K6lX4K4l4l4l4l4l4l4l');
      return next(createApiError(401, 'unauthenticated', 'Invalid email or password'));
    }

    if (isLockedOut(user)) {
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'denied',
        surface: 'staff_api',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'account_locked' },
      });
      return next(createApiError(401, 'unauthenticated', 'Account locked due to too many failed attempts'));
    }

    if (user.isActive === false) {
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'denied',
        surface: 'staff_api',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'account_inactive' },
      });
      return next(createApiError(401, 'unauthenticated', 'Account is deactivated'));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await failedLoginUpdate(user);
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'denied',
        surface: 'staff_api',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'invalid_credential' },
      });
      return next(createApiError(401, 'unauthenticated', 'Invalid email or password'));
    }

    await successfulLoginUpdate(user);
    
    // Create new EmployeeSession
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    
    await EmployeeSession.create({
      adminUser: user._id,
      tokenHash: hashToken(token),
      roleSnapshot: user.role,
      expiresAt: new Date(now + 1000 * 60 * 60 * 12), // 12 hours
      idleExpiresAt: new Date(now + 1000 * 60 * 60 * 2), // 2 hours
      createdIp: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    await recordSecurityEvent({
      type: 'login',
      result: 'success',
      surface: 'staff_api',
      actorType: 'admin_user',
      actorAdminId: user._id,
      subjectEmail,
      req
    });

    const isSecure = process.env.NODE_ENV === 'production';
    const cookieOpts = [
      `${EMPLOYEE_SESSION_COOKIE_NAME}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${60 * 60 * 12}` // 12 hours
    ];
    if (isSecure) cookieOpts.push('Secure');

    res.setHeader('Set-Cookie', cookieOpts.join('; '));

    res.json({
      data: {
        mustChangePassword: user.mustChangePassword
      },
      meta: { requestId: req.id }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', trustedOriginMiddleware, staffAuthMiddleware, async (req, res, next) => {
  try {
    if (req.staffSessionId) {
      await EmployeeSession.deleteOne({ _id: req.staffSessionId });
    }

    await recordSecurityEvent({
      type: 'logout',
      result: 'success',
      surface: 'staff_api',
      actorType: 'admin_user',
      actorAdminId: req.staff._id,
      req
    });

    const isSecure = process.env.NODE_ENV === 'production';
    const cookieOpts = [
      `${EMPLOYEE_SESSION_COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0'
    ];
    if (isSecure) cookieOpts.push('Secure');

    res.setHeader('Set-Cookie', cookieOpts.join('; '));
    res.json({ data: { success: true }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
