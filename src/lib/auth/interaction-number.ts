import "server-only";

import { randomBytes } from "node:crypto";

// Same alphabet/rationale as case-conversion's caseNumber generation.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Mirrors server/utils/interactionNumber.js exactly — see ADR-003 §3. */
export function generateInteractionNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  let suffix = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `IQ-${year}-${suffix}`;
}
