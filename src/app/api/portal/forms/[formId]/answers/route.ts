import "server-only";

import { saveClientAnswers } from "@/lib/forms/form-service";
import { formOutcomeResponse, loadFormForRoute, readFormBody } from "@/lib/forms/portal-form-route";

/**
 * Autosave of the client's own answers (ADR-021 §12, §23). The body is
 * `{ revision, answers }`; only client-writable template keys are accepted and
 * a stale `revision` is a controlled 409 — nothing is ever silently overwritten.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ formId: string }> }): Promise<Response> {
  // Autosave is debounced in the editor; the ceiling is generous but bounded.
  const result = await loadFormForRoute(request, params, { rateLimitBucket: "portal-form-save", rateLimitMax: 120 });
  if (!result.ok) return result.response;

  const body = await readFormBody(request);
  if (!body.ok) return body.response;

  const { form, template, actor } = result.loaded;
  const outcome = await saveClientAnswers({ form, template, patch: body.body.answers, expectedRevision: body.body.revision, actor });
  return formOutcomeResponse(outcome, template);
}
