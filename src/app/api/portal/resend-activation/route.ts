import "server-only";

import { verifyOrigin } from "../../../../lib/auth/csrf";
import { getUnverifiedSession } from "../../../../lib/auth/session";
import { resendActivationInvitation } from "../../../../lib/auth/invitations";
import { isRateLimited } from "../../../../lib/rate-limit";
import { jsonError, jsonOk } from "../../../../lib/auth/http";
import { recordSecurityEvent } from "../../../../lib/security/security-events";

/**
 * "Resend my activation email", for the unverified welcome screen (ADR-033).
 * Needs an unverified session, and only ever emails that account's own address,
 * at most once per cooldown. It answers the same way whatever the address is.
 */
export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      request,
      meta: { route: "/api/portal/resend-activation" },
    });
    return jsonError("forbidden", "Request rejected.");
  }
  if (await isRateLimited("portal-resend-activation", request)) {
    return jsonError("rate_limited", "Too many attempts. Please try again later.");
  }

  const actor = await getUnverifiedSession(request);
  if (!actor) return jsonError("unauthenticated", "Please sign in to continue.");

  const outcome = await resendActivationInvitation({ email: actor.email, firstName: actor.firstName });
  if (outcome === "too_soon") return jsonError("rate_limited", "We sent a link a moment ago. Please wait a minute before requesting another.");
  if (outcome === "unavailable") return jsonError("server_error", "We could not send the email right now. Please try again shortly.");
  return jsonOk({ sent: true });
}
