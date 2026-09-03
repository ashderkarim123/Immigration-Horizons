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
import { failedLoginUpdate, isLockedOut, successfulLoginUpdate } from "../../../../lib/auth/lockout";
import { recordSecurityEvent } from "../../../../lib/security/security-events";

// Computed once (not a hardcoded literal, which risks an invalid bcrypt
// encoding) so a login attempt for a non-existent email still pays the same
// bcrypt.compare cost as a real one — avoids a timing side-channel that
// would otherwise let an attacker distinguish "no such account" from "wrong
// password" by response latency alone.
const DUMMY_HASH = bcrypt.hashSync("no-such-account-timing-guard", 12);

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      request,
      meta: { route: "/api/portal/login" },
    });
    return jsonError("forbidden", "Request rejected.");
  }
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
    await recordSecurityEvent({
      type: "login_failed",
      result: "failure",
      surface: "portal",
      actorType: "anonymous",
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "no_such_account" },
    });
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const now = Date.now();
  if (isLockedOut(client, now)) {
    // Deliberately the same generic message as any other failure — the
    // account being locked is not information a caller should be able to
    // distinguish from "wrong password".
    await recordSecurityEvent({
      type: "login_failed",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      actorClientId: client._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "account_locked" },
    });
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const passwordOk = await verifyPassword(password, client.passwordHash);
  if (!passwordOk) {
    const { patch, justLocked } = failedLoginUpdate(client, now);
    Object.assign(client, patch);
    await client.save();

    await recordSecurityEvent({
      type: "login_failed",
      result: "failure",
      surface: "portal",
      actorType: "anonymous",
      actorClientId: client._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "bad_password" },
    });
    if (justLocked) {
      await recordSecurityEvent({
        type: "account_locked",
        result: "denied",
        surface: "portal",
        actorType: "anonymous",
        actorClientId: client._id,
        subjectEmail: normalizedEmail,
        request,
        meta: { lockedUntil: patch.lockedUntil?.toISOString() },
      });
    }
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  // status !== "active" covers "pending" (never activated — shouldn't be
  // possible with a password set, but fail closed anyway) and "disabled".
  if (client.status !== "active") {
    await recordSecurityEvent({
      type: "login_failed",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      actorClientId: client._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "account_not_active", status: String(client.status) },
    });
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  Object.assign(client, successfulLoginUpdate(now));
  await client.save();

  const sessionToken = await createSession(String(client._id), {
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
    userAgent: request.headers.get("user-agent") || "",
  });

  await recordSecurityEvent({
    type: "login_succeeded",
    result: "success",
    surface: "portal",
    actorType: "client",
    actorClientId: client._id,
    actorName: `${client.firstName || ""} ${client.lastName || ""}`.trim(),
    subjectEmail: normalizedEmail,
    request,
  });

  return jsonOk(
    { redirectTo: safePortalRedirect(body.next) },
    { headers: { "Set-Cookie": serializeSessionCookie(sessionToken) } },
  );
}
