import "server-only";

import { guardPortalRequest, readPortalJsonBody } from "@/lib/auth/portal-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { changeClientPassword } from "@/lib/auth/client-account";

/**
 * Password change for a signed-in client (ADR-011 §4).
 *
 * Requires the current password even though the session is already
 * authenticated — an unattended open session must not be enough to lock
 * the account's real owner out.
 *
 * Its own rate-limit bucket, separate from `portal-profile`: this endpoint
 * accepts a credential guess, so it must not share a budget with an
 * endpoint that does not.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-password-change" });
  if (!guard.ok) return guard.response;

  const parsed = await readPortalJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = await changeClientPassword({
    clientUserId: guard.context.actor.clientUserId,
    currentSessionId: guard.context.actor.sessionId,
    currentPassword: parsed.body.currentPassword,
    newPassword: parsed.body.newPassword,
    confirmPassword: parsed.body.confirmPassword,
  });

  if (result.outcome === "validation_error") {
    return jsonError("unprocessable", result.message);
  }
  if (result.outcome === "not_found") {
    return jsonError("unauthenticated", "Please log in.");
  }
  if (result.outcome === "unchanged") {
    return jsonOk({ outcome: "unchanged" });
  }

  return jsonOk({ outcome: "updated", revokedSessions: result.value.revokedSessions });
}
