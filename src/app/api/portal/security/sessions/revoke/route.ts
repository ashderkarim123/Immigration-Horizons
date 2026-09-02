import "server-only";

import { guardPortalRequest, readPortalJsonBody } from "@/lib/auth/portal-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { revokeClientSession } from "@/lib/auth/client-account";
import { serializeClearedSessionCookie } from "@/lib/auth/session";

/**
 * Revokes one of the client's own sessions (ADR-011 §4).
 *
 * The lookup filters on `{ _id, clientUser }` together, so another
 * account's session id returns the same 404 as a nonexistent one — a
 * client can neither revoke nor confirm the existence of anyone else's
 * session.
 *
 * Revoking the *current* session is allowed (it is a perfectly reasonable
 * "sign out this device" action) and clears the cookie in the response, so
 * the browser is not left holding a token whose row is gone.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-session-revoke" });
  if (!guard.ok) return guard.response;

  const parsed = await readPortalJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const sessionId = parsed.body.sessionId;
  if (typeof sessionId !== "string" || !sessionId) {
    return jsonError("invalid_input", "Choose a session to sign out.");
  }

  const result = await revokeClientSession({
    clientUserId: guard.context.actor.clientUserId,
    currentSessionId: guard.context.actor.sessionId,
    sessionId,
  });

  if (result.outcome !== "updated") {
    return jsonError("not_found", "That session could not be found.");
  }

  const response = jsonOk({
    outcome: "updated",
    wasCurrent: result.value.wasCurrent,
    redirectTo: result.value.wasCurrent ? "/portal/login" : undefined,
  });

  if (result.value.wasCurrent) {
    response.headers.set("Set-Cookie", serializeClearedSessionCookie());
  }

  return response;
}
