import "server-only";

import { guardPortalRequest } from "@/lib/auth/portal-api";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { getClientTracking } from "@/lib/uscis/client-view";

/** USCIS tracking on a case the signed-in client belongs to: client-visible filings and events only. Read-only. */
export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-uscis", readOnly: true });
  if (!guard.ok) return guard.response;

  const { caseId } = await params;
  const accessible = await getAccessibleCase(caseId, String(guard.context.actor.clientUserId));
  if (!accessible) return jsonError("not_found", "That case could not be found.");

  return jsonOk({ filings: await getClientTracking(String(accessible.caseDoc._id)) });
}
