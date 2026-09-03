import "server-only";

import { getDb } from "../db";
import {
  SecurityEvent,
  type SecurityEventActorType,
  type SecurityEventResult,
  type SecurityEventSurface,
  type SecurityEventType,
} from "../models/SecurityEvent";

/**
 * Recording side of the security audit log (ADR-012 §2). Mirrors
 * server/utils/securityEvents.js.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **It never throws.** An audit write failing must not turn a working
 *    login into a 500 — the same decoupling the lead pipeline uses
 *    (CLAUDE.md, "Lead delivery"). The trade-off is real and deliberate:
 *    a Mongo outage loses audit entries rather than locking every user out
 *    of the platform. Failures are logged to stderr so the gap is visible
 *    in process logs. ADR-012 §2 records why fail-open beat fail-closed.
 *
 * 2. **It cannot be handed a credential.** `meta` is filtered against a
 *    denylist before it is written. Call sites are already careful; this
 *    exists so that a future call site being careless is a dropped field
 *    rather than a password in a database that operators query freely.
 */

/** Must stay in step with docs/architecture/security-event-contract.json. */
const FORBIDDEN_META_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "passwordhash",
  "token",
  "tokenhash",
  "sessiontoken",
  "csrftoken",
  "secret",
  "authorization",
  "cookie",
]);

const REDACTED = "[redacted]";

/**
 * Shallow by design. Nesting a credential inside an object would defeat a
 * one-level scan, so nested objects are dropped entirely rather than
 * walked — audit metadata is a flat bag of scalars everywhere it is used,
 * and keeping it that way is what makes the guarantee checkable.
 */
export function sanitizeMeta(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (FORBIDDEN_META_KEYS.has(key.toLowerCase())) {
      clean[key] = REDACTED;
      continue;
    }
    if (value === null || value === undefined) continue;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      clean[key] = t === "string" ? (value as string).slice(0, 500) : value;
    } else if (Array.isArray(value)) {
      clean[key] = value.filter((v) => ["string", "number", "boolean"].includes(typeof v)).slice(0, 50);
    }
    // Objects, functions, dates and everything else are dropped.
  }
  return Object.keys(clean).length ? clean : null;
}

export type SecurityRequestContext = { ip: string; userAgent: string };

/** Same header precedence as the rate limiter, so the two agree on "who". */
export function requestSecurityContext(request: Request): SecurityRequestContext {
  const headers = request.headers;
  return {
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "",
    // Truncated, not parsed: this log is read by operators during an
    // incident, where the exact string matters. `describeUserAgent` in
    // client-account.ts is for the client-facing device list instead.
    userAgent: (headers.get("user-agent") || "").slice(0, 400),
  };
}

export type SecurityEventInput = {
  type: SecurityEventType;
  result: SecurityEventResult;
  surface: SecurityEventSurface;
  actorType: SecurityEventActorType;
  actorClientId?: unknown;
  actorAdminId?: unknown;
  actorName?: string;
  subjectEmail?: string;
  request?: Request;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown> | null;
};

export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await db;

    const context = input.request
      ? requestSecurityContext(input.request)
      : { ip: input.ip || "", userAgent: input.userAgent || "" };

    await SecurityEvent.create({
      type: input.type,
      result: input.result,
      surface: input.surface,
      actorType: input.actorType,
      actorClient: input.actorClientId ?? null,
      actorAdmin: input.actorAdminId ?? null,
      actorName: input.actorName || "",
      subjectEmail: input.subjectEmail || "",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: sanitizeMeta(input.meta),
    });
  } catch (error) {
    // Deliberately swallowed — see the module comment. Never re-thrown.
    console.error(
      "[security-event] failed to record",
      input.type,
      error instanceof Error ? error.message : error,
    );
  }
}
