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

/**
 * Employee sign-in for the SaaS app (ADR-009 §2). Mirrors the client login
 * route's security posture exactly: Origin check, rate limit, generic
 * error, and a constant-cost bcrypt compare for unknown accounts so
 * response timing never reveals whether an employee account exists.
 *
 * Credentials are the same AdminUser records the admin CMS uses — this
 * route verifies against them but never writes them.
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
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
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
  const user = await AdminUser.findOne({ email: normalizedEmail }).select("password role isActive");

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  const passwordMatches = await verifyPassword(password, user.password);

  // A deactivated employee gets the same generic failure as a wrong
  // password — "this account exists but is disabled" is information.
  if (!passwordMatches || user.isActive === false) {
    return jsonError("unauthenticated", GENERIC_LOGIN_ERROR);
  }

  // A role the capability map doesn't know cannot be authorized against,
  // so refuse rather than sign in a session that would silently hold
  // nothing. (Also catches the `editor`/`viewer` CMS-only roles reaching
  // for a SaaS session they have no case-working capabilities for — they
  // keep using admin.*.)
  const role = String(user.role || "");
  if (!role) return jsonError("forbidden", "This account has no assigned role.");

  const token = await createEmployeeSession(String(user._id), role, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
    userAgent: request.headers.get("user-agent") || "",
  });

  const response = jsonOk({ redirectTo: safeStaffRedirect(body.next) });
  response.headers.set("Set-Cookie", serializeEmployeeSessionCookie(token));
  return response;
}
