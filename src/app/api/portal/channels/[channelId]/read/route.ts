import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getAccessibleChannel } from "../../../../../../lib/auth/collaboration-policy";
import { markChannelRead } from "../../../../../../lib/collaboration/read-state-service";

/** Client marks a channel read — monotonic, never moves the marker backward (ADR-005 §12). */
export async function POST(request: Request, { params }: { params: Promise<{ channelId: string }> }): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-mark-read", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  const { channelId } = await params;

  let body: { lastReadMessageId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // no body is fine — mark read through the latest message
  }

  const accessible = await getAccessibleChannel(channelId, String(client._id));
  if (!accessible) return jsonError("not_found", "That channel could not be found.");

  const result = await markChannelRead({
    channel: accessible.channel,
    workspaceMemberId: String(accessible.membership._id),
    lastReadMessageId: typeof body.lastReadMessageId === "string" ? body.lastReadMessageId : null,
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);

  return jsonOk({});
}
