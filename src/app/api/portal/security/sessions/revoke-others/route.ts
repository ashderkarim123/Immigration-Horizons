import "server-only";

import { guardPortalRequest } from "@/lib/auth/portal-api";
import { jsonOk } from "@/lib/auth/http";
import { revokeOtherClientSessions } from "@/lib/auth/client-account";

/**
 * Signs the client out of every device except this one (ADR-011 §4).
 *
 * The "I think someone else is in my account" button. It deliberately
 * keeps the current session: the person pressing it is the one who should
 * stay signed in, and logging them out too would send them to a login
 * screen at the exact moment they are worried about their credentials.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-session-revoke" });
  if (!guard.ok) return guard.response;

  const { revokedSessions } = await revokeOtherClientSessions({
    clientUserId: guard.context.actor.clientUserId,
    currentSessionId: guard.context.actor.sessionId,
  });

  return jsonOk({ outcome: "updated", revokedSessions });
}
