import "server-only";

import { guardPortalRequest } from "@/lib/auth/portal-api";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { getClientCalendar } from "@/lib/calendar/client-view";

/** Upcoming dates on a case the signed-in client belongs to: client-safe sources only. Read-only. */
export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-calendar", readOnly: true });
  if (!guard.ok) return guard.response;

  const { caseId } = await params;
  const clientUserId = String(guard.context.actor.clientUserId);
  const accessible = await getAccessibleCase(caseId, clientUserId);
  if (!accessible) return jsonError("not_found", "That case could not be found.");

  const items = await getClientCalendar({ caseId: String(accessible.caseDoc._id), workspaceId: String(accessible.workspace._id), clientUserId });
  return jsonOk({ items });
}
