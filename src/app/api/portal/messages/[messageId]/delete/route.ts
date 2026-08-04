import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getAccessibleMessage } from "../../../../../../lib/auth/collaboration-policy";
import { deleteMessage } from "../../../../../../lib/collaboration/message-service";

/** Client soft-deletes their own message (ADR-005 §14). */
export async function POST(request: Request, { params }: { params: Promise<{ messageId: string }> }): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-message-edit", request)) {
    return jsonError("rate_limited", "Too many requests. Please try again later.");
  }

  const actor = await getSessionActor(request);
  if (!actor) return jsonError("unauthenticated", "Please log in.");

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const client = await ClientUser.findById(actor.clientUserId);
  if (!client || client.status !== "active") return jsonError("unauthenticated", "Please log in.");

  const { messageId } = await params;

  const accessible = await getAccessibleMessage(messageId, String(client._id));
  if (!accessible) return jsonError("not_found", "That message could not be found.");

  const message = accessible.message;
  if (message.senderType !== "client" || String(message.senderClient) !== String(client._id)) {
    return jsonError("forbidden", "You can only delete your own messages.");
  }
  if (message.deletedAt) return jsonError("not_found", "That message could not be found.");

  const result = await deleteMessage({ messageId, actorClientId: String(client._id) });
  if (result.outcome === "not_found") return jsonError("not_found", "That message could not be found.");

  return jsonOk({ messageId: String(result.message._id) });
}
