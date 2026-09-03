import "server-only";

import { getDb } from "../../../../lib/db";
import { ClientUser } from "../../../../lib/models/ClientUser";
import { PasswordResetToken } from "../../../../lib/models/PasswordResetToken";
import { hashToken, hashPassword } from "../../../../lib/auth/crypto";
import { destroyAllSessionsForClient } from "../../../../lib/auth/session";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../lib/rate-limit";
import { isValidPassword } from "../../../../lib/auth/validation";
import { jsonError, jsonOk } from "../../../../lib/auth/http";
import { successfulLoginUpdate } from "../../../../lib/auth/lockout";
import { recordSecurityEvent } from "../../../../lib/security/security-events";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      request,
      meta: { route: "/api/portal/reset-password" },
    });
    return jsonError("forbidden", "Request rejected.");
  }
  if (await isRateLimited("portal-reset-password", request)) {
    return jsonError("rate_limited", "Too many attempts. Please try again later.");
  }

  let body: { token?: unknown; password?: unknown; confirmPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }

  const { token, password, confirmPassword } = body;
  if (typeof token !== "string" || !token) {
    return jsonError("invalid_input", "Missing reset token.");
  }
  if (!isValidPassword(password)) {
    return jsonError("unprocessable", "Password must be at least 10 characters long.");
  }
  if (password !== confirmPassword) {
    return jsonError("unprocessable", "Passwords do not match.");
  }

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const tokenHash = hashToken(token);
  const resetToken = await PasswordResetToken.findOne({ tokenHash });

  // The caller always sees one message; the operator gets the real reason.
  // Token reuse in particular (`already_used`) is a signal worth having —
  // it means a consumed link is being replayed.
  const genericInvalid = async (reason: string, clientId?: unknown) => {
    await recordSecurityEvent({
      type: "password_reset_completed",
      result: "failure",
      surface: "portal",
      actorType: "anonymous",
      actorClientId: clientId,
      request,
      meta: { reason },
    });
    return jsonError(
      "unauthenticated",
      "This reset link is invalid or has expired. Please request a new one.",
    );
  };

  if (!resetToken) return genericInvalid("unknown_token");
  if (resetToken.usedAt) return genericInvalid("already_used", resetToken.clientUser);
  if (resetToken.expiresAt.getTime() <= Date.now()) {
    return genericInvalid("expired", resetToken.clientUser);
  }

  const client = await ClientUser.findById(resetToken.clientUser);
  if (!client || client.status === "disabled") {
    return genericInvalid(client ? "account_disabled" : "no_such_account", resetToken.clientUser);
  }

  const now = new Date();
  client.passwordHash = await hashPassword(password);
  client.passwordChangedAt = now;
  // A successful reset is a reasonable way to clear a lockout — the
  // requester has just proven control of the account's email inbox.
  // `lastLoginAt` is deliberately not taken from the patch: a reset is not
  // a sign-in.
  const { lastLoginAt: _unusedLastLogin, ...lockoutCleared } = successfulLoginUpdate();
  Object.assign(client, lockoutCleared);
  if (client.status === "locked") client.status = "active";
  await client.save();

  resetToken.usedAt = now;
  await resetToken.save();

  // Every existing session is invalidated — a reset is exactly the moment
  // a credential compromise is suspected.
  await destroyAllSessionsForClient(String(client._id));

  await recordSecurityEvent({
    type: "password_reset_completed",
    result: "success",
    surface: "portal",
    actorType: "client",
    actorClientId: client._id,
    subjectEmail: String(client.normalizedEmail || client.email || ""),
    request,
    meta: { allSessionsRevoked: true },
  });

  return jsonOk({ redirectTo: "/portal/login" });
}
