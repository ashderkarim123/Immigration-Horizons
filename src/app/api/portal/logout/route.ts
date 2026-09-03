import "server-only";

import { destroySession, getSessionActor, serializeClearedSessionCookie } from "../../../../lib/auth/session";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { jsonError, jsonOk } from "../../../../lib/auth/http";
import { recordSecurityEvent } from "../../../../lib/security/security-events";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      request,
      meta: { route: "/api/portal/logout" },
    });
    return jsonError("forbidden", "Request rejected.");
  }

  // Resolved before the session row is deleted — afterwards there is no
  // way left to attribute the event to an account.
  const actor = await getSessionActor(request);

  await destroySession(request);

  if (actor) {
    await recordSecurityEvent({
      type: "logout",
      result: "success",
      surface: "portal",
      actorType: "client",
      actorClientId: actor.clientUserId,
      request,
    });
  }

  return jsonOk(
    { redirectTo: "/portal/login" },
    { headers: { "Set-Cookie": serializeClearedSessionCookie() } },
  );
}
