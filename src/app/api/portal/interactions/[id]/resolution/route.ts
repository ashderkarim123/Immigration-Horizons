import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { confirmClientResolution } from "../../../../../../lib/auth/interactions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-interaction-resolution", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  let body: { resolved?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }
  if (typeof body.resolved !== "boolean") {
    return jsonError("invalid_input", "Missing resolution choice.");
  }

  const { id } = await params;
  const result = await confirmClientResolution(
    id,
    String(client._id),
    client.firstName || client.email,
    body.resolved,
    typeof body.note === "string" ? body.note : undefined,
  );

  if (result.outcome === "not_authorized") {
    return jsonError("not_found", "That request could not be found.");
  }
  if (result.outcome === "failed") {
    return jsonError("server_error", "Something went wrong recording your response.");
  }

  return jsonOk({});
}
