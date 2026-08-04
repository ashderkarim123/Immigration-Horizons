import "server-only";

import { getDb } from "../../../../../../lib/db";
import { ClientUser } from "../../../../../../lib/models/ClientUser";
import { getSessionActor } from "../../../../../../lib/auth/session";
import { verifyOrigin } from "../../../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../../../lib/auth/http";
import { getAccessibleMessage } from "../../../../../../lib/auth/collaboration-policy";
import { createMessage } from "../../../../../../lib/collaboration/message-service";

/** Client reply — one-level threading, a reply-to-a-reply normalizes to the thread root (ADR-005 §9). */
export async function POST(request: Request, { params }: { params: Promise<{ messageId: string }> }): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-message-send", request)) {
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

  let body: { body?: unknown; mentions?: unknown; idempotencyKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }
  if (typeof body.body !== "string") {
    return jsonError("invalid_input", "A message body is required.");
  }

  const accessible = await getAccessibleMessage(messageId, String(client._id));
  if (!accessible) return jsonError("not_found", "That message could not be found.");

  const result = await createMessage({
    channel: accessible.channel as never,
    senderClientId: String(client._id),
    senderDisplayName: client.firstName || client.email,
    body: body.body,
    parentMessageId: messageId,
    mentionWorkspaceMemberIds: Array.isArray(body.mentions) ? (body.mentions as string[]) : [],
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", Object.values(result.errors)[0]);

  const rootId = accessible.message.threadRoot || accessible.message._id;
  return jsonOk({
    messageId: String(result.message._id),
    redirectTo: `/portal/cases/${accessible.channel.case}/messages/${accessible.channel._id}/threads/${rootId}`,
  });
}
