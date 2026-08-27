import "server-only";

import { getDb } from "../../../../../lib/db";
import { ClientUser } from "../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../lib/auth/http";
import { markAllReadForClient } from "../../../../../lib/notifications/notification-service";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-notifications-read-all", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  await markAllReadForClient(client._id);
  return jsonOk({});
}
