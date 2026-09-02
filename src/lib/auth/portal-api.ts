import "server-only";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { getSessionActor, type SessionActor } from "./session";
import { verifyOrigin } from "./csrf";
import { isRateLimited } from "../rate-limit";
import { jsonError } from "./http";

/**
 * The gate every mutating `/api/portal/*` account route passes through
 * (ADR-011 §5) — the client-side counterpart of `staff-api.ts`.
 *
 * Origin check, rate limit, session, and a live re-read of the account, in
 * a fixed order that cannot be reassembled wrongly route by route. The
 * account re-read matters: disabling a client in the admin CMS must take
 * effect on their next request, not their next sign-in.
 *
 * The returned actor carries `sessionId`, which the security routes need
 * in order to tell "this device" from every other one.
 *
 * Routes written before this module (login, activate, documents,
 * messages, notifications) keep their inline equivalent of these checks;
 * they are covered by their own tests and rewriting them was outside this
 * cycle. This is the pattern for anything new.
 */

export type PortalApiContext = {
  actor: SessionActor;
  client: {
    _id: unknown;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
};

export type PortalApiGuard =
  | { ok: true; context: PortalApiContext }
  | { ok: false; response: Response };

export async function guardPortalRequest(
  request: Request,
  options: { rateLimitBucket: string },
): Promise<PortalApiGuard> {
  if (!verifyOrigin(request)) {
    return { ok: false, response: jsonError("forbidden", "Request rejected.") };
  }
  if (await isRateLimited(options.rateLimitBucket, request)) {
    return {
      ok: false,
      response: jsonError("rate_limited", "Too many requests. Please try again later."),
    };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, response: jsonError("server_error", "Service temporarily unavailable.") };
  }
  await db;

  const actor = await getSessionActor(request);
  if (!actor) {
    return { ok: false, response: jsonError("unauthenticated", "Please log in.") };
  }

  const client = await ClientUser.findById(actor.clientUserId)
    .select("email firstName lastName phone status")
    .lean();

  const record = client as Record<string, unknown> | null;
  if (!record || record.status !== "active") {
    return { ok: false, response: jsonError("unauthenticated", "Please log in.") };
  }

  return {
    ok: true,
    context: {
      actor,
      client: {
        _id: record._id,
        email: String(record.email || ""),
        firstName: String(record.firstName || ""),
        lastName: String(record.lastName || ""),
        phone: String(record.phone || ""),
      },
    },
  };
}

/** Parses a JSON body, or returns the standard invalid-body response. */
export async function readPortalJsonBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return { ok: false, response: jsonError("invalid_input", "Invalid request body.") };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, response: jsonError("invalid_input", "Invalid request body.") };
  }
}
