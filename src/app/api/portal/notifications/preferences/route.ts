import "server-only";

import { getDb } from "../../../../../lib/db";
import { ClientUser } from "../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../lib/auth/http";
import { updateClientPreferences } from "../../../../../lib/notifications/notification-service";

const DIGEST_FREQUENCIES = ["daily", "weekly", "off"] as const;

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-notification-preferences", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  let body: { mentionEmails?: unknown; digestEmails?: unknown; digestFrequency?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Expected a JSON body.");
  }

  const digestFrequency = DIGEST_FREQUENCIES.includes(body.digestFrequency as (typeof DIGEST_FREQUENCIES)[number])
    ? (body.digestFrequency as (typeof DIGEST_FREQUENCIES)[number])
    : "daily";

  await updateClientPreferences({
    clientUserId: client._id,
    updates: {
      mentionEmails: Boolean(body.mentionEmails),
      digestEmails: Boolean(body.digestEmails),
      digestFrequency,
    },
  });

  return jsonOk({});
}
