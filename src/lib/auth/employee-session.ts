import "server-only";

import { cookies } from "next/headers";

import { getDb } from "../db";
import { AdminUser } from "../models/AdminUser";
import { EmployeeSession } from "../models/EmployeeSession";
import { generateToken, hashToken } from "./crypto";
import type { EmployeeActor } from "./actors";

/**
 * Employee sessions for the SaaS app (ADR-009 §2). Mirrors the client
 * session design in `session.ts` — opaque token in the cookie, SHA-256
 * hash at rest, absolute + idle expiry, revocable by deleting the row.
 *
 * Kept as a separate module rather than generalising `session.ts`: the two
 * actor types must never be interchangeable, and a shared "session"
 * abstraction with a `type` discriminator is exactly the kind of thing
 * that turns one bug into a privilege escalation.
 */

export const EMPLOYEE_SESSION_COOKIE_NAME = "ih_staff_session";

const ABSOLUTE_TIMEOUT_MS = 1000 * 60 * 60 * 12; // 12h — shorter than the client's; staff sessions sit on shared machines
const IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 2; // 2h

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${maxAgeSeconds}`;
}

export function serializeEmployeeSessionCookie(token: string): string {
  return `${EMPLOYEE_SESSION_COOKIE_NAME}=${token}; ${cookieAttributes(ABSOLUTE_TIMEOUT_MS / 1000)}`;
}

export function serializeClearedEmployeeSessionCookie(): string {
  return `${EMPLOYEE_SESSION_COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

export function readEmployeeSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === EMPLOYEE_SESSION_COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

export async function createEmployeeSession(
  adminUserId: string,
  role: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("MONGODB_URI is not configured");
  await db;

  const token = generateToken();
  const now = Date.now();

  await EmployeeSession.create({
    adminUser: adminUserId,
    tokenHash: hashToken(token),
    roleSnapshot: role,
    expiresAt: new Date(now + ABSOLUTE_TIMEOUT_MS),
    idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS),
    createdIp: meta.ip || "",
    userAgent: meta.userAgent || "",
    lastSeenAt: new Date(now),
  });

  return token;
}

/**
 * Validates a token and returns the live employee actor.
 *
 * Deliberately re-reads the AdminUser on every request rather than
 * trusting `roleSnapshot`: deactivating an employee or changing their role
 * in the admin CMS must take effect on their very next request in the SaaS
 * app, not at their next sign-in. Returns null (never throws) for any
 * invalid/expired/deactivated case so callers fail closed uniformly.
 */
async function lookupEmployeeByToken(token: string | null): Promise<EmployeeActor | null> {
  if (!token) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const session = await EmployeeSession.findOne({ tokenHash: hashToken(token) });
  if (!session) return null;

  const now = new Date();
  if (session.expiresAt <= now || session.idleExpiresAt <= now) {
    await EmployeeSession.deleteOne({ _id: session._id });
    return null;
  }

  const user = await AdminUser.findById(session.adminUser).select("role isActive").lean();
  if (!user || user.isActive === false) {
    // Deactivated mid-session — revoke rather than merely deny, so the
    // stale row cannot be reused if the account is later re-enabled.
    await EmployeeSession.deleteOne({ _id: session._id });
    return null;
  }

  session.idleExpiresAt = new Date(Date.now() + IDLE_TIMEOUT_MS);
  session.lastSeenAt = now;
  await session.save();

  return { type: "employee", adminUserId: String(session.adminUser), role: String(user.role || "") };
}

export async function getEmployeeActor(request: Request): Promise<EmployeeActor | null> {
  return lookupEmployeeByToken(readEmployeeSessionToken(request));
}

export async function getEmployeeActorFromCookieStore(): Promise<EmployeeActor | null> {
  const store = await cookies();
  return lookupEmployeeByToken(store.get(EMPLOYEE_SESSION_COOKIE_NAME)?.value ?? null);
}

export async function destroyEmployeeSession(request: Request): Promise<void> {
  const token = readEmployeeSessionToken(request);
  if (!token) return;
  const db = getDb();
  if (!db) return;
  await db;
  await EmployeeSession.deleteOne({ tokenHash: hashToken(token) });
}

/** Revokes every session for an employee — used when an account is deactivated. */
export async function destroyAllSessionsForEmployee(adminUserId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db;
  await EmployeeSession.deleteMany({ adminUser: adminUserId });
}
