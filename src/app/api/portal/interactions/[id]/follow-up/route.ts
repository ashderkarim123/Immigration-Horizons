import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { addClientFollowUp } from "../../../../../../lib/auth/interactions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-interaction-follow-up", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }
  if (typeof body.body !== "string") {
    return jsonError("invalid_input", "Follow-up text is required.");
  }

  const { id } = await params;
  const result = await addClientFollowUp(id, String(client._id), client.firstName || client.email, body.body);

  if (result.outcome === "not_authorized") {
    return jsonError("not_found", "That request could not be found.");
  }
  if (result.outcome === "validation_error") {
    return jsonError("unprocessable", result.message || "Invalid follow-up.");
  }
  if (result.outcome === "failed") {
    return jsonError("server_error", "Something went wrong adding your follow-up.");
  }

  return jsonOk({});
}
