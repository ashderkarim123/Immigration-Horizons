/**
 * DB-backed administrator authentication (ADR-029), shared by the legacy EJS login and the JSON Admin API so the two
 * cannot drift on lockout, deactivation, the admin.cms.access gate or what is audited.
 *
 * It knows nothing about the environment break-glass credential: that stays in the EJS route, which may try it only
 * after this returns `no_such_account`. The Admin API never does.
 */
const bcrypt = require('bcryptjs');
const AdminUser = require('../models/admin/User');
const { can } = require('../utils/permissions');
const { recordSecurityEvent } = require('../utils/securityEvents');
const { isLockedOut, failedLoginUpdate, successfulLoginUpdate } = require('../utils/lockout');

// Compared against when no account matches, so an unknown email costs the same bcrypt work as a known one.
const DUMMY_HASH = '$2a$12$KIX0Y3FfTMBiP9oV4i1DcuUGSJOThsRBbwdB0hGimj63E2T8BYVJO';

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** What a CMS session stores about the signed-in administrator. Authorization always re-reads the account. */
const sessionIdentity = (user) => ({ isAdmin: true, adminUser: { id: String(user._id), name: user.name, role: user.role } });

/**
 * @returns {{ ok: true, user } | { ok: false, reason: 'no_such_account'|'account_locked'|'bad_password'|'account_deactivated'|'cms_access_denied' }}
 * Every outcome except `no_such_account` is audited here; the caller audits that one, because only the caller knows
 * whether another credential (the EJS break-glass) is still to be tried.
 */
async function authenticateAdmin({ email, password, req, via }) {
  const subjectEmail = normalizeEmail(email);
  const candidate = typeof password === 'string' ? password : '';
  const base = { surface: 'admin_cms', subjectEmail, req };
  const meta = (extra) => (via ? { ...extra, via } : extra);

  // `isActive` is deliberately not part of the query: a deactivated account must still be found, so guesses against
  // it are counted and audited.
  const user = subjectEmail ? await AdminUser.findOne({ email: subjectEmail }) : null;
  if (!user) {
    await bcrypt.compare(candidate, DUMMY_HASH);
    return { ok: false, reason: 'no_such_account' };
  }

  const denied = async (reason, event = {}) => {
    await recordSecurityEvent({ type: 'login_failed', result: 'denied', actorType: 'anonymous', actorAdminId: user._id, ...base, meta: meta({ reason }), ...event });
    return { ok: false, reason };
  };

  if (isLockedOut(user)) return denied('account_locked');

  if (!(await user.comparePassword(candidate))) {
    const { patch, justLocked } = failedLoginUpdate(user);
    // updateOne, never save(): saving re-validates the whole document and re-runs the bcrypt hook (ADR-012 §3).
    await AdminUser.updateOne({ _id: user._id }, { $set: patch });
    await denied('bad_password', { result: 'failure' });
    if (justLocked) {
      await recordSecurityEvent({
        type: 'account_locked', result: 'denied', actorType: 'anonymous', actorAdminId: user._id, ...base,
        meta: { lockedUntil: patch.lockedUntil && patch.lockedUntil.toISOString() },
      });
    }
    return { ok: false, reason: 'bad_password' };
  }

  // Correct credential from here on, so the lockout counters are left alone: it was not a guess.
  if (user.isActive === false) return denied('account_deactivated');

  if (!can({ staff: user }, 'admin.cms.access')) {
    await recordSecurityEvent({
      type: 'permission_denied', result: 'denied', actorType: 'admin_user', actorAdminId: user._id, actorName: user.name, ...base,
      meta: meta({ reason: 'cms_access_denied', role: user.role }),
    });
    return { ok: false, reason: 'cms_access_denied' };
  }

  await AdminUser.updateOne({ _id: user._id }, { $set: successfulLoginUpdate() });
  await recordSecurityEvent({
    type: 'login_succeeded', result: 'success', actorType: 'admin_user', actorAdminId: user._id, actorName: user.name || '', ...base,
    meta: meta({ role: user.role }),
  });
  return { ok: true, user };
}

module.exports = { authenticateAdmin, sessionIdentity, normalizeEmail };
