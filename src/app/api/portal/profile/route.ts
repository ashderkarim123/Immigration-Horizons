import "server-only";

import { guardPortalRequest, readPortalJsonBody } from "@/lib/auth/portal-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { updateClientProfile } from "@/lib/auth/client-account";

/**
 * Updates the signed-in client's own display details (ADR-011 §4).
 *
 * There is no client id in the request. The record updated is the one the
 * session resolves to, so this route cannot be pointed at another account
 * regardless of what the body contains.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-profile" });
  if (!guard.ok) return guard.response;

  const parsed = await readPortalJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const result = await updateClientProfile(guard.context.actor.clientUserId, {
    firstName: parsed.body.firstName,
    lastName: parsed.body.lastName,
    phone: parsed.body.phone,
  });

  if (result.outcome === "validation_error") {
    return jsonError("unprocessable", result.message);
  }
  if (result.outcome === "not_found") {
    return jsonError("unauthenticated", "Please log in.");
  }

  return jsonOk({ outcome: result.outcome });
}
