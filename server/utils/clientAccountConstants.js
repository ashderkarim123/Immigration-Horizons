/**
 * Cross-app constants for client account/invitation handling (ADR-007 §2).
 * These MUST stay identical to the Next.js app's own values — an
 * invitation issued by one app is consumed by the other, so a drift in TTL
 * or hash algorithm silently breaks activation. Asserted by
 * server/test/client-account-contract.test.js against
 * docs/architecture/client-account-contract.json.
 */

/** Matches src/lib/auth/invitations.ts's INVITATION_TTL_MS. */
const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** Matches src/lib/auth/crypto.ts's hashToken(). */
const TOKEN_HASH_ALGORITHM = 'sha256';

/** Bytes of entropy in a raw token — matches crypto.ts's generateToken(). */
const TOKEN_BYTES = 32;

/** The purpose an admin-issued portal invitation is recorded under. */
const ADMIN_INVITATION_PURPOSE = 'consultation_activation';

/** Client account statuses an admin may switch between. */
const CLIENT_STATUS_ACTIVE = 'active';
const CLIENT_STATUS_DISABLED = 'disabled';

module.exports = {
  INVITATION_TTL_MS,
  TOKEN_HASH_ALGORITHM,
  TOKEN_BYTES,
  ADMIN_INVITATION_PURPOSE,
  CLIENT_STATUS_ACTIVE,
  CLIENT_STATUS_DISABLED,
};
