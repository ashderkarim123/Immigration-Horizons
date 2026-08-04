import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getAccessibleMessage } from "../../../../../../lib/auth/collaboration-policy";
import { editMessage } from "../../../../../../lib/collaboration/message-service";
import { MESSAGE_EDIT_WINDOW_MS } from "../../../../../../lib/content/collaboration-constants";

/** Client edits their own message, within the edit window (ADR-005 §14). */
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

  let body: { body?: unknown; mentions?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }
  if (typeof body.body !== "string") return jsonError("invalid_input", "A message body is required.");

  const accessible = await getAccessibleMessage(messageId, String(client._id));
  if (!accessible) return jsonError("not_found", "That message could not be found.");

  const message = accessible.message;
  if (message.senderType !== "client" || String(message.senderClient) !== String(client._id)) {
    return jsonError("forbidden", "You can only edit your own messages.");
  }
  if (message.deletedAt) return jsonError("not_found", "That message could not be found.");
  if (Date.now() - new Date(message.createdAt as unknown as string).getTime() > MESSAGE_EDIT_WINDOW_MS) {
    return jsonError("forbidden", "This message can no longer be edited.");
  }

  try {
    const result = await editMessage({
      messageId,
      newBody: body.body,
      mentionWorkspaceMemberIds: Array.isArray(body.mentions) ? (body.mentions as string[]) : [],
      actorClientId: String(client._id),
    });
    if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);
    if (result.outcome === "not_found") return jsonError("not_found", "That message could not be found.");
    return jsonOk({ messageId: String(result.message._id) });
  } catch (err) {
    if ((err as { isVersionConflict?: boolean }).isVersionConflict) {
      return jsonError("conflict", "This message was updated by someone else. Please reload and try again.");
    }
    throw err;
  }
}
