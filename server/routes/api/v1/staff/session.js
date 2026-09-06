/**
 * Staff API session routes: login and logout.
 *
 * Security model (ADR-016):
 * - employees use Immigration Horizons-managed credentials (not Firebase)
 * - opaque random session token stored in HttpOnly ih_staff_session cookie
 * - SHA-256 hash stored at rest in employee_sessions collection
 * - lockout counters applied via AdminUser.updateOne (not user.save()) to
 *   avoid re-running the bcrypt pre-save hook on an already-hashed password
 */
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

// Precomputed dummy hash for constant-time rejection of unknown accounts
// (prevents timing oracle revealing whether an email address exists).
const DUMMY_HASH = '$2a$12$KIX0Y3FfTMBiP9oV4i1DcuUGSJOThsRBbwdB0hGimj63E2T8BYVJO';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many login attempts.' } }
});

const GENERIC_AUTH_FAILURE = 'Invalid email or password.';

router.post('/login', trustedOriginMiddleware, loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(createApiError(400, 'invalid_input', 'Email and password are required.'));
    }

    const subjectEmail = String(email).trim().toLowerCase();
    const user = await AdminUser.findOne({ email: subjectEmail });

    if (!user) {
      // Constant-time rejection — prevents timing oracle on unknown emails
      await bcrypt.compare(password, DUMMY_HASH);
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'failure',
        surface: 'staff',
        actorType: 'anonymous',
        subjectEmail,
        req,
        meta: { reason: 'unknown_account' },
      });
      return next(createApiError(401, 'unauthenticated', GENERIC_AUTH_FAILURE));
    }

    // Check lockout before password comparison to avoid wasting bcrypt
    if (isLockedOut(user)) {
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'denied',
        surface: 'staff',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'account_locked' },
      });
      return next(createApiError(401, 'unauthenticated', GENERIC_AUTH_FAILURE));
    }

    if (user.isActive === false) {
      // Still do the bcrypt compare so timing is identical to an active account
      await bcrypt.compare(password, user.password);
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'denied',
        surface: 'staff',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'account_inactive' },
      });
      return next(createApiError(401, 'unauthenticated', GENERIC_AUTH_FAILURE));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Apply lockout patch via updateOne — NEVER user.save() on the login path
      // because save() re-validates all fields and re-runs the bcrypt pre-save hook.
      const { patch, justLocked } = failedLoginUpdate(user);
      await AdminUser.updateOne({ _id: user._id }, { $set: patch });

      await recordSecurityEvent({
        type: 'login_failed',
        result: 'failure',
        surface: 'staff',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'invalid_credential', locked: justLocked },
      });

      if (justLocked) {
        await recordSecurityEvent({
          type: 'account_locked',
          result: 'success',
          surface: 'staff',
          actorType: 'system',
          actorAdminId: user._id,
          subjectEmail,
          req,
        });
      }

      return next(createApiError(401, 'unauthenticated', GENERIC_AUTH_FAILURE));
    }

    // Valid role check — must have a recognized role to log in
    const validRoles = ['super_admin', 'admin', 'editor', 'pm', 'petition_writer',
      'business_plan_specialist', 'recommendation_letter_specialist',
      'uscis_forms_specialist', 'evidence_collector', 'reviewer', 'viewer'];
    if (!user.role || !validRoles.includes(user.role)) {
      await recordSecurityEvent({
        type: 'login_failed',
        result: 'denied',
        surface: 'staff',
        actorType: 'anonymous',
        actorAdminId: user._id,
        subjectEmail,
        req,
        meta: { reason: 'invalid_role' },
      });
      return next(createApiError(401, 'unauthenticated', GENERIC_AUTH_FAILURE));
    }

    // Successful credential — apply login patch (clears lockout, stamps lastLoginAt)
    const loginPatch = successfulLoginUpdate();
    await AdminUser.updateOne({ _id: user._id }, { $set: loginPatch });

    // Create new EmployeeSession
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    await EmployeeSession.create({
      adminUser: user._id,
      tokenHash: hashToken(token),
      roleSnapshot: user.role,
      expiresAt: new Date(now + 1000 * 60 * 60 * 12), // 12 hours absolute
      idleExpiresAt: new Date(now + 1000 * 60 * 60 * 2), // 2 hours idle
      createdIp: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    await recordSecurityEvent({
      type: 'login_succeeded',
      result: 'success',
      surface: 'staff',
      actorType: 'admin_user',
      actorAdminId: user._id,
      actorName: user.name || '',
      subjectEmail,
      req,
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

    // After successful auth, reveal mustChangePassword so Angular can redirect
    res.json({
      data: {
        mustChangePassword: user.mustChangePassword === true,
      },
      meta: { requestId: req.id },
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
      surface: 'staff',
      actorType: 'admin_user',
      actorAdminId: req.staff._id,
      actorName: req.staff.name || '',
      req,
    });

    const isSecure = process.env.NODE_ENV === 'production';
    const cookieOpts = [
      `${EMPLOYEE_SESSION_COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
    ];
    if (isSecure) cookieOpts.push('Secure');
    res.setHeader('Set-Cookie', cookieOpts.join('; '));

    res.json({ data: { success: true }, meta: { requestId: req.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
