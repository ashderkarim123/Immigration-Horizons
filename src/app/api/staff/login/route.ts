import "server-only";

import bcrypt from "bcryptjs";

import { getDb } from "@/lib/db";
import { AdminUser } from "@/lib/models/AdminUser";
import { verifyPassword } from "@/lib/auth/crypto";
import { createEmployeeSession, serializeEmployeeSessionCookie } from "@/lib/auth/employee-session";
import { verifyOrigin } from "@/lib/auth/csrf";
import { isRateLimited } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/auth/validation";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { failedLoginUpdate, isLockedOut, successfulLoginUpdate } from "@/lib/auth/lockout";
import { recordSecurityEvent } from "@/lib/security/security-events";

/**
 * Employee sign-in for the SaaS app (ADR-009 §2). Mirrors the client login
 * route's security posture exactly: Origin check, rate limit, generic
 * error, and a constant-cost bcrypt compare for unknown accounts so
 * response timing never reveals whether an employee account exists.
 *
 * Credentials are the same AdminUser records the admin CMS uses. Since
 * ADR-012 3 this route also writes their lockout counters — and only
 * those. Per-account lockout has to be enforced by every surface that
 * accepts the credential, or an attacker locked out here simply moves to
 * admin.* and keeps guessing.
 */

// Computed once so an unknown email still pays a real bcrypt cost.
const DUMMY_HASH = bcrypt.hashSync("no-such-employee-timing-guard", 12);

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

/** Only ever redirect within the staff area — never to an attacker-supplied host. */
function safeStaffRedirect(next: unknown): string {
  if (typeof next !== "string") return "/staff";
  if (!next.startsWith("/staff")) return "/staff";
  // Reject protocol-relative and any embedded scheme.
  if (next.startsWith("//") || next.includes("://")) return "/staff";
  return next;
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "staff",
      actorType: "anonymous",
      request,
      meta: { route: "/api/staff/login" },
    });
    return jsonError("forbidden", "Request rejected.");
  }
  if (await isRateLimited("staff-login", request)) {
    return jsonError("rate_limited", "Too many sign-in attempts. Please try again later.");
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
  const user = await AdminUser.findOne({ email: normalizedEmail }).select(
    "name password role isActive failedLoginCount lockedUntil",
  );

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    await recordSecurityEvent({
      type: "login_failed",
      result: "failure",
      surface: "staff",
      actorType: "anonymous",
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "no_such_account" },
    });
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const now = Date.now();
  if (isLockedOut(user, now)) {
    // Same generic message as any other failure: that an account is locked
    // is not something an unauthenticated caller may learn.
    await recordSecurityEvent({
      type: "login_failed",
      result: "denied",
      surface: "staff",
      actorType: "anonymous",
      actorAdminId: user._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "account_locked" },
    });
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const passwordMatches = await verifyPassword(password, user.password);

  if (!passwordMatches) {
    const { patch, justLocked } = failedLoginUpdate(user, now);
    // updateOne, not user.save(): AdminUser is a mirror this app does not
    // own. Saving the document would re-validate fields the CMS owns and
    // re-run its bcrypt pre('save') hook over an already-hashed password.
    await AdminUser.updateOne({ _id: user._id }, { $set: patch });

    await recordSecurityEvent({
      type: "login_failed",
      result: "failure",
      surface: "staff",
      actorType: "anonymous",
      actorAdminId: user._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "bad_password" },
    });
    if (justLocked) {
      await recordSecurityEvent({
        type: "account_locked",
        result: "denied",
        surface: "staff",
        actorType: "anonymous",
        actorAdminId: user._id,
        subjectEmail: normalizedEmail,
        request,
        meta: { lockedUntil: patch.lockedUntil?.toISOString() },
      });
    }
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  // A deactivated employee gets the same generic failure as a wrong
  // password — "this account exists but is disabled" is information.
  // Counters are deliberately NOT touched here: the credential was
  // correct, so counting it as a failed guess would let a deactivated
  // account's owner lock out their own (possibly later reactivated) login.
  if (user.isActive === false) {
    await recordSecurityEvent({
      type: "login_failed",
      result: "denied",
      surface: "staff",
      actorType: "anonymous",
      actorAdminId: user._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "account_deactivated" },
    });
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  // A role the capability map doesn't know cannot be authorized against,
  // so refuse rather than sign in a session that would silently hold
  // nothing. (Also catches the `editor`/`viewer` CMS-only roles reaching
  // for a SaaS session they have no case-working capabilities for — they
  // keep using admin.*.)
  const role = String(user.role || "");
  if (!role) {
    await recordSecurityEvent({
      type: "login_failed",
      result: "denied",
      surface: "staff",
      actorType: "anonymous",
      actorAdminId: user._id,
      subjectEmail: normalizedEmail,
      request,
      meta: { reason: "no_role_assigned" },
    });
    return jsonError("forbidden", "This account has no assigned role.");
  }

  await AdminUser.updateOne({ _id: user._id }, { $set: successfulLoginUpdate(now) });

  const token = await createEmployeeSession(String(user._id), role, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
    userAgent: request.headers.get("user-agent") || "",
  });

  await recordSecurityEvent({
    type: "login_succeeded",
    result: "success",
    surface: "staff",
    actorType: "admin_user",
    actorAdminId: user._id,
    actorName: String(user.name || ""),
    subjectEmail: normalizedEmail,
    request,
    meta: { role },
  });

  const response = jsonOk({ redirectTo: safeStaffRedirect(body.next) });
  response.headers.set("Set-Cookie", serializeEmployeeSessionCookie(token));
  return response;
}
