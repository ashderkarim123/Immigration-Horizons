import "server-only";

import { getDb } from "../../../../lib/db";
import { ClientUser } from "../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../lib/auth/session";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../lib/auth/http";
import { createClientInteraction } from "../../../../lib/auth/interactions";
import { SCOPE_TYPES, INTERACTION_TYPES } from "../../../../lib/content/interaction-constants";

/**
 * Client-facing query/scheduling-request submission — the first
 * authenticated (not just pre-auth) portal API route. Reuses
 * getSessionActor(request) exactly like every other Route Handler in this
 * app (ADR-001 decision 2), rather than requireClient() (which redirects —
 * only appropriate for Server Component pages, not a JSON API).
 */
export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-interaction-create", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  let body: {
    scopeType?: unknown;
    consultationId?: unknown;
    caseId?: unknown;
    workspaceId?: unknown;
    subject?: unknown;
    description?: unknown;
    type?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }

  if (typeof body.scopeType !== "string" || !SCOPE_TYPES.includes(body.scopeType as never)) {
    return jsonError("invalid_input", "Invalid scope.");
  }
  if (typeof body.type !== "string" || !INTERACTION_TYPES.includes(body.type as never)) {
    return jsonError("invalid_input", "Invalid interaction type.");
  }
  if (typeof body.subject !== "string" || typeof body.description !== "string") {
    return jsonError("invalid_input", "Subject and description are required.");
  }

  const result = await createClientInteraction({
    clientUserId: String(client._id),
    clientName: client.firstName || client.email,
    scopeType: body.scopeType as "consultation" | "case",
    consultationId: typeof body.consultationId === "string" ? body.consultationId : undefined,
    caseId: typeof body.caseId === "string" ? body.caseId : undefined,
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : undefined,
    subject: body.subject,
    description: body.description,
    type: body.type as (typeof INTERACTION_TYPES)[number],
  });

  if (result.outcome === "not_authorized") {
    // Same 404-shaped denial as everywhere else — never confirm/deny a
    // consultation/case id's existence to a client who isn't its owner/member.
    return jsonError("not_found", "That consultation or case could not be found.");
  }
  if (result.outcome === "validation_error") {
    return jsonError("unprocessable", result.message);
  }
  if (result.outcome === "failed") {
    return jsonError("server_error", "Something went wrong submitting your request.");
  }

  return jsonOk({ interactionId: result.interactionId, redirectTo: `/portal/queries/${result.interactionId}` });
}
