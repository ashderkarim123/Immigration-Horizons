const crypto = require('crypto');

// Same alphabet/rationale as utils/caseNumber.js — excludes visually
// ambiguous characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * IQ-<year>-<6 random chars> — same collision-resistant, non-sequential
 * design as generateCaseNumber(), different prefix so the two identifier
 * families are never confused at a glance (ADR-003 §3).
 */
function generateInteractionNumber(date = new Date()) {
  const year = date.getFullYear();
  let suffix = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `IQ-${year}-${suffix}`;
}

module.exports = { generateInteractionNumber };
