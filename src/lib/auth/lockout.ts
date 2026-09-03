import "server-only";

/**
 * Per-account login lockout, shared by the client portal and the staff app
 * (ADR-012 §3). Mirrors server/utils/lockout.js.
 *
 * IP rate limiting and per-account lockout defend against different
 * attacks and neither substitutes for the other: the rate limiter stops
 * one host guessing many passwords, the lockout stops many hosts guessing
 * one account's password. Before this module the client portal had both
 * and the two employee sign-in surfaces had only the first — which put the
 * weaker control on the higher-privilege actor.
 *
 * Both `ClientUser` and `AdminUser` carry the same two counter fields, so
 * these helpers build a **field patch** rather than touching a model. That
 * shape is not incidental: `AdminUser` is a mirror this app does not own,
 * and applying its patch through `updateOne({ $set })` rather than
 * `document.save()` avoids re-validating a document whose other fields
 * this app has no business validating, and cannot re-run the CMS's
 * bcrypt `pre('save')` hook against an already-hashed password.
 */

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 1000 * 60 * 15; // 15 minutes

export type LockoutCounters = {
  failedLoginCount?: number | null;
  lockedUntil?: Date | null;
};

export type LockoutPatch = {
  failedLoginCount: number;
  lockedUntil: Date | null;
};

export function isLockedOut(account: LockoutCounters, now: number = Date.now()): boolean {
  return !!account.lockedUntil && account.lockedUntil.getTime() > now;
}

/**
 * Builds the counter update for one failed attempt, and reports whether
 * that attempt is the one that locks the account.
 *
 * The counter resets when the lock is applied rather than staying at the
 * threshold: once the lock expires the account gets a fresh budget, which
 * makes the lock a delay rather than a state an attacker could hold an
 * account in indefinitely by continuing to guess.
 */
export function failedLoginUpdate(
  account: LockoutCounters,
  now: number = Date.now(),
): { patch: LockoutPatch; justLocked: boolean } {
  const next = (account.failedLoginCount || 0) + 1;

  if (next >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return {
      patch: { failedLoginCount: 0, lockedUntil: new Date(now + LOCK_DURATION_MS) },
      justLocked: true,
    };
  }

  return { patch: { failedLoginCount: next, lockedUntil: null }, justLocked: false };
}

/** Counter update for a successful sign-in: clear the lockout, stamp the login. */
export function successfulLoginUpdate(
  now: number = Date.now(),
): LockoutPatch & { lastLoginAt: Date } {
  return { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(now) };
}
