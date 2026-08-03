const crypto = require('crypto');

// Excludes visually ambiguous characters (0/O, 1/I/L) so a case number read
// aloud or hand-copied by a client is less error-prone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates a human-readable, collision-resistant case number:
 * IH-<year>-<6 random characters>, e.g. "IH-2026-K3F9QZ".
 *
 * Deliberately NOT a counted sequence (`countDocuments() + 1`) — that
 * pattern race-conditions under concurrent conversions (two managers
 * converting different leads in the same second can both read the same
 * count) and requires a full collection scan to stay correct as the
 * collection grows. Random suffix + a real unique index + retry-on-collision
 * (see ClientCase.generateUniqueCaseNumber) is safe under concurrency without
 * either of those costs. 6 characters over a 32-symbol alphabet is ~30 bits
 * of entropy — collision probability across even tens of thousands of cases
 * is negligible, and a collision only costs a cheap retry, not a correctness
 * failure. No timestamp-derived or otherwise predictable suffix — nothing
 * about a case number should let anyone guess an adjacent one.
 */
function generateCaseNumber(date = new Date()) {
  const year = date.getFullYear();
  let suffix = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `IH-${year}-${suffix}`;
}

module.exports = { generateCaseNumber };
