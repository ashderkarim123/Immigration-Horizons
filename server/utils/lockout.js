/**
 * Per-account login lockout (ADR-012 §3). Mirror of
 * src/lib/auth/lockout.ts — the SaaS staff app and this admin CMS
 * authenticate the SAME AdminUser records, so both must count failures
 * onto the same fields with the same thresholds. A lockout enforced by
 * only one of them is not a lockout: an attacker simply uses the other.
 *
 * These build a **field patch** rather than mutating a document, so the
 * caller can apply it with `updateOne({ $set })`. That matters here: a
 * full `document.save()` on login re-validates every field, so one legacy
 * row with an off-enum role would stop being able to log in at all, and it
 * would re-run this model's bcrypt `pre('save')` hook against an
 * already-hashed password.
 *
 * The thresholds are asserted against
 * docs/architecture/security-event-contract.json from both sides.
 */

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 1000 * 60 * 15; // 15 minutes

function isLockedOut(account, now = Date.now()) {
  return !!(account && account.lockedUntil && account.lockedUntil.getTime() > now);
}

/**
 * Counter update for one failed attempt; also reports whether this attempt
 * locked the account. The counter resets when the lock is applied so the
 * lock is a delay, not a state an attacker can hold an account in forever.
 */
function failedLoginUpdate(account, now = Date.now()) {
  const next = ((account && account.failedLoginCount) || 0) + 1;

  if (next >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return {
      patch: { failedLoginCount: 0, lockedUntil: new Date(now + LOCK_DURATION_MS) },
      justLocked: true,
    };
  }

  return { patch: { failedLoginCount: next, lockedUntil: null }, justLocked: false };
}

/** Counter update for a successful sign-in: clear the lockout, stamp the login. */
function successfulLoginUpdate(now = Date.now()) {
  return { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(now) };
}

module.exports = {
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCK_DURATION_MS,
  isLockedOut,
  failedLoginUpdate,
  successfulLoginUpdate,
};
