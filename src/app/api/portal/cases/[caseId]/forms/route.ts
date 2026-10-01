import "server-only";

import { guardPortalRequest } from "@/lib/auth/portal-api";
import { getAccessibleCase } from "@/lib/auth/case-policy";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { listClientForms } from "@/lib/forms/form-queries";
import { toClientListItem } from "@/lib/forms/form-service";

/** The forms on a case the signed-in client belongs to. */
export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }): Promise<Response> {
  const guard = await guardPortalRequest(request, { rateLimitBucket: "portal-form-list", readOnly: true });
  if (!guard.ok) return guard.response;

  const { caseId } = await params;
  const accessible = await getAccessibleCase(caseId, String(guard.context.actor.clientUserId));
  if (!accessible) return jsonError("not_found", "That case could not be found.");

  const forms = await listClientForms(String(accessible.caseDoc._id));
  return jsonOk({ forms: forms.map(toClientListItem) });
}
