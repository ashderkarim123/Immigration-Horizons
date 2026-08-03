import "server-only";

import bcrypt from "bcryptjs";

import { getDb } from "../../../../lib/db";
import { ClientUser } from "../../../../lib/models/ClientUser";
import { verifyPassword } from "../../../../lib/auth/crypto";
import { createSession, serializeSessionCookie } from "../../../../lib/auth/session";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../lib/rate-limit";
import { isValidEmail, safePortalRedirect } from "../../../../lib/auth/validation";
import { jsonError, jsonOk } from "../../../../lib/auth/http";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 1000 * 60 * 15; // 15 minutes

// Computed once (not a hardcoded literal, which risks an invalid bcrypt
// encoding) so a login attempt for a non-existent email still pays the same
// bcrypt.compare cost as a real one — avoids a timing side-channel that
// would otherwise let an attacker distinguish "no such account" from "wrong
// password" by response latency alone.
const DUMMY_HASH = bcrypt.hashSync("no-such-account-timing-guard", 12);

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-login", request)) {
    return jsonError("rate_limited", "Too many login attempts. Please try again later.");
  }

  let body: { email?: unknown; password?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }

  const { email, password } = body;
  if (!isValidEmail(email) || typeof password !== "string" || !password) {
    return jsonError("invalid_input", "Please enter your email and password.");
  }

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const normalizedEmail = email.trim().toLowerCase();
  const client = await ClientUser.findOne({ normalizedEmail });

  if (!client) {
    // Pay the same hashing cost as a real user so response timing does not
    // reveal whether the account exists (module 02: "No account enumeration").
    await verifyPassword(password, DUMMY_HASH);
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const now = Date.now();
  if (client.lockedUntil && client.lockedUntil.getTime() > now) {
    // Deliberately the same generic message as any other failure — the
    // account being locked is not information a caller should be able to
    // distinguish from "wrong password".
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const passwordOk = await verifyPassword(password, client.passwordHash);
  if (!passwordOk) {
    client.failedLoginCount = (client.failedLoginCount || 0) + 1;
    if (client.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      client.lockedUntil = new Date(now + LOCK_DURATION_MS);
      client.failedLoginCount = 0;
    }
    await client.save();
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  // status !== "active" covers "pending" (never activated — shouldn't be
  // possible with a password set, but fail closed anyway) and "disabled".
  if (client.status !== "active") {
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  client.failedLoginCount = 0;
  client.lockedUntil = null;
  client.lastLoginAt = new Date(now);
  await client.save();

  const sessionToken = await createSession(String(client._id), {
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
    userAgent: request.headers.get("user-agent") || "",
  });

  return jsonOk(
    { redirectTo: safePortalRedirect(body.next) },
    { headers: { "Set-Cookie": serializeSessionCookie(sessionToken) } },
  );
}
