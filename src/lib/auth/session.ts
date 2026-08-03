import "server-only";

import { getDb } from "../db";
import { ClientSession } from "../models/ClientSession";
import { ClientUser } from "../models/ClientUser";
import { generateToken, hashToken } from "./crypto";

/**
 * DB-backed client-portal session (see
 * docs/architecture/ADR-001-client-portal-foundation.md, decision 3).
 */

export const SESSION_COOKIE_NAME = "ih_portal_session";

const ABSOLUTE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 2; // 2 hours

export type SessionActor = {
  clientUserId: string;
  sessionId: string;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieAttributes(maxAgeSeconds: number): string {
  const parts = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

export function serializeSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; ${cookieAttributes(ABSOLUTE_TIMEOUT_MS / 1000)}`;
}

export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Creates a new session and rotates away any previous one implicitly (the
 * caller discards the old cookie by issuing this new one) — used after
 * login and after activation so a pre-auth session id is never reused
 * post-auth (session fixation protection).
 */
export async function createSession(
  clientUserId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("MONGODB_URI is not configured");
  await db;

  const token = generateToken();
  const now = Date.now();

  await ClientSession.create({
    clientUser: clientUserId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now + ABSOLUTE_TIMEOUT_MS),
    idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS),
    createdIp: meta.ip || "",
    userAgent: meta.userAgent || "",
    lastSeenAt: new Date(now),
  });

  return token;
}

/**
 * Core lookup shared by both entry points below: given a raw session
 * token, validate it and (if active) extend the idle timeout. Returns null
 * (never throws) for any invalid/expired/missing session so callers can
 * fail closed uniformly.
 */
async function lookupSessionByToken(
  token: string | null,
): Promise<SessionActor | null> {
  if (!token) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const tokenHash = hashToken(token);
  const session = await ClientSession.findOne({ tokenHash });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.idleExpiresAt.getTime() <= now) {
    // Expired sessions are left for the TTL index to sweep rather than
    // deleted synchronously on the read path — deleting here would turn a
    // simple auth check into a write on every request.
    return null;
  }

  const client = await ClientUser.findById(session.clientUser);
  if (!client || client.status !== "active") return null;

  session.idleExpiresAt = new Date(now + IDLE_TIMEOUT_MS);
  session.lastSeenAt = new Date(now);
  await session.save();

  return {
    clientUserId: String(session.clientUser),
    sessionId: String(session._id),
  };
}

/** For Route Handlers, which receive the raw `Request` and can be tested by constructing one directly. */
export async function getSessionActor(
  request: Request,
): Promise<SessionActor | null> {
  return lookupSessionByToken(readSessionToken(request));
}

/**
 * For Server Components/pages, which have no `Request` to read and instead
 * use `next/headers`'s request-scoped cookie store. Not usable outside a
 * real Next.js request-handling context — Route Handlers and tests should
 * use `getSessionActor(request)` above instead.
 */
export async function getSessionActorFromCookieStore(): Promise<SessionActor | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return lookupSessionByToken(store.get(SESSION_COOKIE_NAME)?.value ?? null);
}

/** Logout — deletes exactly the presented session so other sessions/devices are unaffected. */
export async function destroySession(request: Request): Promise<void> {
  const token = readSessionToken(request);
  if (!token) return;

  const db = getDb();
  if (!db) return;
  await db;

  await ClientSession.deleteOne({ tokenHash: hashToken(token) });
}

/**
 * Password reset invalidates every existing session for the account — a
 * reset is exactly the moment a credential compromise is suspected, so
 * every other logged-in session (device, browser) must be forced out too.
 */
export async function destroyAllSessionsForClient(
  clientUserId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db;

  await ClientSession.deleteMany({ clientUser: clientUserId });
}
