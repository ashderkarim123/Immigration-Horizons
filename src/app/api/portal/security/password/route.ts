import "server-only";

import { guardPortalRequest, readPortalJsonBody } from "@/lib/auth/portal-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { changeClientPassword } from "@/lib/auth/client-account";
import { recordSecurityEvent } from "@/lib/security/security-events";

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
    // A wrong current password is a credential guess against a live
    // session, not a typo worth ignoring — record it as a failure so a
    // hijacked-session attempt is visible. Other validation errors (too
    // short, mismatched confirmation) are ordinary form noise.
    if (result.field === "currentPassword") {
      await recordSecurityEvent({
        type: "password_changed",
        result: "failure",
        surface: "portal",
        actorType: "client",
        actorClientId: guard.context.client._id,
        subjectEmail: guard.context.client.email,
        request,
        meta: { reason: "wrong_current_password" },
      });
    }
    return jsonError("unprocessable", result.message);
  }
  if (result.outcome === "not_found") {
    return jsonError("unauthenticated", "Please log in.");
  }
  if (result.outcome === "unchanged") {
    return jsonOk({ outcome: "unchanged" });
  }

  await recordSecurityEvent({
    type: "password_changed",
    result: "success",
    surface: "portal",
    actorType: "client",
    actorClientId: guard.context.client._id,
    actorName: `${guard.context.client.firstName} ${guard.context.client.lastName}`.trim(),
    subjectEmail: guard.context.client.email,
    request,
    meta: { revokedSessions: result.value.revokedSessions },
  });

  return jsonOk({ outcome: "updated", revokedSessions: result.value.revokedSessions });
}
