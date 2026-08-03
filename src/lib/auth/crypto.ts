import "server-only";

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/** Lowercased + trimmed form used for lookups and the unique index. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Cryptographically random, URL-safe token for invitations, resets, and sessions. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * One-way digest used to store tokens at rest. Tokens are already
 * high-entropy random values (not user-chosen secrets like passwords), so a
 * fast hash plus a unique index is the correct tool here — bcrypt is
 * reserved for passwords, where slow hashing defends against low-entropy
 * user input.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison for token hashes, to avoid timing side-channels on lookup fallbacks. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}
