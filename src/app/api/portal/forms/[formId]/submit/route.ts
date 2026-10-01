import "server-only";

import { submitClientForm } from "@/lib/forms/form-service";
import { formOutcomeResponse, loadFormForRoute, readFormBody } from "@/lib/forms/portal-form-route";

/** Client submit — validated authoritatively on the server; draft | needs_changes -> submitted. */
export async function POST(request: Request, { params }: { params: Promise<{ formId: string }> }): Promise<Response> {
  const result = await loadFormForRoute(request, params, { rateLimitBucket: "portal-form-submit", rateLimitMax: 10 });
  if (!result.ok) return result.response;

  const body = await readFormBody(request);
  if (!body.ok) return body.response;

  const { form, template, actor } = result.loaded;
  const outcome = await submitClientForm({ form, template, expectedRevision: body.body.revision, actor });
  return formOutcomeResponse(outcome, template);
}
