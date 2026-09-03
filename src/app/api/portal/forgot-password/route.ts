import "server-only";

import { getDb } from "../../../../lib/db";
import { ClientUser } from "../../../../lib/models/ClientUser";
import { PasswordResetToken } from "../../../../lib/models/PasswordResetToken";
import { generateToken, hashToken, normalizeEmail } from "../../../../lib/auth/crypto";
import { sendPasswordResetEmail } from "../../../../lib/auth/email";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../lib/rate-limit";
import { isValidEmail } from "../../../../lib/auth/validation";
import { jsonError, jsonOk } from "../../../../lib/auth/http";
import { recordSecurityEvent } from "../../../../lib/security/security-events";

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

// Identical response regardless of whether the account exists, is active,
// disabled, etc. — module 02: "No account enumeration."
const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent password reset instructions.";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      request,
      meta: { route: "/api/portal/forgot-password" },
    });
    return jsonError("forbidden", "Request rejected.");
  }
  if (await isRateLimited("portal-forgot-password", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }

  if (!isValidEmail(body.email)) {
    // Still generic — an invalid-looking email is not a reason to reveal
    // anything different from a well-formed but unknown one.
    return jsonOk({ message: GENERIC_MESSAGE });
  }

  const db = getDb();
  if (db) {
    try {
      await db;
      const normalizedEmail = normalizeEmail(body.email);
      const client = await ClientUser.findOne({ normalizedEmail });

      // Only active or locked accounts are eligible — pending accounts
      // should use their activation link, and disabled accounts should not
      // be re-enabled via a password reset. None of this branches the
      // response; it only decides whether an email actually goes out.
      if (client && (client.status === "active" || client.status === "locked")) {
        const now = new Date();
        // At most one active reset token per account at a time.
        await PasswordResetToken.updateMany(
          { clientUser: client._id, usedAt: null, expiresAt: { $gt: now } },
          { $set: { expiresAt: now } },
        );

        const token = generateToken();
        await PasswordResetToken.create({
          clientUser: client._id,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + RESET_TTL_MS),
          requestedIp:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "",
        });

        await sendPasswordResetEmail({
          email: client.email,
          firstName: client.firstName || "there",
          token,
        });

        await recordSecurityEvent({
          type: "password_reset_requested",
          result: "success",
          surface: "portal",
          actorType: "anonymous",
          actorClientId: client._id,
          subjectEmail: normalizedEmail,
          request,
        });
      } else {
        // Recorded even when no email goes out. A burst of requests against
        // addresses that do not resolve is exactly the enumeration attempt
        // the generic response is designed to hide from the caller — it
        // must not be hidden from the operator as well.
        await recordSecurityEvent({
          type: "password_reset_requested",
          result: "failure",
          surface: "portal",
          actorType: "anonymous",
          subjectEmail: normalizedEmail,
          request,
          meta: { reason: client ? "ineligible_status" : "no_such_account" },
        });
      }
    } catch (err) {
      console.error("[portal] forgot-password failed:", err);
      // Still falls through to the generic response below.
    }
  }

  return jsonOk({ message: GENERIC_MESSAGE });
}
