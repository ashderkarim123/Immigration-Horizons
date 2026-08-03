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

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
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

  const genericInvalid = () =>
    jsonError(
      "unauthenticated",
      "This reset link is invalid or has expired. Please request a new one.",
    );

  if (!resetToken) return genericInvalid();
  if (resetToken.usedAt) return genericInvalid();
  if (resetToken.expiresAt.getTime() <= Date.now()) return genericInvalid();

  const client = await ClientUser.findById(resetToken.clientUser);
  if (!client || client.status === "disabled") return genericInvalid();

  const now = new Date();
  client.passwordHash = await hashPassword(password);
  client.passwordChangedAt = now;
  // A successful reset is a reasonable way to clear a lockout — the
  // requester has just proven control of the account's email inbox.
  client.failedLoginCount = 0;
  client.lockedUntil = null;
  if (client.status === "locked") client.status = "active";
  await client.save();

  resetToken.usedAt = now;
  await resetToken.save();

  // Every existing session is invalidated — a reset is exactly the moment
  // a credential compromise is suspected.
  await destroyAllSessionsForClient(String(client._id));

  return jsonOk({ redirectTo: "/portal/login" });
}
