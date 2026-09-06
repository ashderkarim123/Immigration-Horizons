const crypto = require('crypto');
const EmployeeSession = require('../../models/EmployeeSession');
const AdminUser = require('../../models/admin/User');
const { createApiError } = require('./apiError');

const EMPLOYEE_SESSION_COOKIE_NAME = 'ih_staff_session';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=') || null;
    }
  }
  return null;
}

/**
 * Validates the ih_staff_session cookie, re-reads the AdminUser,
 * and attaches `req.staff` and `req.staffSessionId`.
 */
async function staffAuthMiddleware(req, res, next) {
  try {
    const token = parseCookie(req.headers.cookie, EMPLOYEE_SESSION_COOKIE_NAME);
    if (!token) {
      return next(createApiError(401, 'unauthenticated', 'Authentication required'));
    }

    const hashedToken = hashToken(token);
    const session = await EmployeeSession.findOne({ tokenHash: hashedToken });
    if (!session) {
      return next(createApiError(401, 'unauthenticated', 'Invalid or expired session'));
    }

    const now = new Date();
    if (session.expiresAt <= now || session.idleExpiresAt <= now) {
      await EmployeeSession.deleteOne({ _id: session._id });
      return next(createApiError(401, 'unauthenticated', 'Session expired'));
    }

    const user = await AdminUser.findById(session.adminUser).lean();
    if (!user || user.isActive === false) {
      await EmployeeSession.deleteOne({ _id: session._id });
      return next(createApiError(401, 'unauthenticated', 'Account deactivated'));
    }

    // Touch idle expiry
    session.idleExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2); // 2 hours
    session.lastSeenAt = now;
    await session.save();

    req.staff = user;
    req.staffSessionId = session._id;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces the first-login password change flow.
 * If mustChangePassword is true, block access to normal APIs.
 */
function requirePasswordSetupComplete(req, res, next) {
  if (req.staff && req.staff.mustChangePassword) {
    return next(createApiError(403, 'password_change_required', 'You must set a permanent password before continuing'));
  }
  next();
}

/**
 * Capability guard generator.
 * Depends on utils/permissions.js to check capabilities based on req.staff.role.
 */
function requireApiCapability(capability) {
  const { CAPABILITIES } = require('../../utils/permissions');
  
  return (req, res, next) => {
    if (!req.staff || !req.staff.role) {
      return next(createApiError(403, 'forbidden', 'Missing role'));
    }

    const role = req.staff.role;
    const allowedRoles = CAPABILITIES[capability];

    if (!Array.isArray(allowedRoles)) {
      return next(createApiError(403, 'forbidden', 'Unknown capability'));
    }

    if (role === 'super_admin' || allowedRoles.includes(role)) {
      return next();
    }

    return next(createApiError(403, 'forbidden', `Missing capability: ${capability}`));
  };
}

module.exports = {
  staffAuthMiddleware,
  requirePasswordSetupComplete,
  requireApiCapability,
  EMPLOYEE_SESSION_COOKIE_NAME,
  hashToken
};
