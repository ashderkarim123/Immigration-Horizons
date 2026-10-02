import "server-only";

import { guardPortalRequest, readPortalJsonBody, type PortalApiContext } from "../auth/portal-api";
import { getAccessibleForm } from "../auth/form-policy";
import { jsonError, jsonOk } from "../auth/http";
import { toClientDto, type ClientActor, type FormOutcome, type StoredForm, type StoredTemplate } from "./form-service";

/**
 * Shared preamble + response mapping for the three portal form routes, so the
 * gate order (origin -> rate limit -> session -> live account -> row policy)
 * and the error envelope cannot drift between them.
 */

type FormRouteOptions = { rateLimitBucket: string; rateLimitMax?: number; readOnly?: boolean };
type LoadedForm = { context: PortalApiContext; actor: ClientActor; form: StoredForm; template: StoredTemplate };

export async function loadFormForRoute(
  request: Request,
  params: Promise<{ formId: string }>,
  options: FormRouteOptions,
): Promise<{ ok: true; loaded: LoadedForm } | { ok: false; response: Response }> {
  const guard = await guardPortalRequest(request, options);
  if (!guard.ok) return guard;

  const { formId } = await params;
  const accessible = await getAccessibleForm(formId, String(guard.context.actor.clientUserId));
  if (!accessible) return { ok: false, response: jsonError("not_found", "That form could not be found.") };

  const { client } = guard.context;
  const name = client.firstName || client.email;
  return {
    ok: true,
    loaded: { context: guard.context, actor: { id: String(client._id), name }, ...accessible },
  };
}

/** Body for a mutating form route: `{ revision, answers? }`. */
export async function readFormBody(request: Request) {
  return readPortalJsonBody(request);
}

const failure = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error: { code, message, ...extra } }, { status });

export function formOutcomeResponse(result: FormOutcome, template: StoredTemplate): Response {
  switch (result.outcome) {
    case "saved":
    case "unchanged":
      return jsonOk({ form: toClientDto(result.form, template) });
    case "validation_error":
      return failure(422, "unprocessable", "Please correct the highlighted fields.", { fieldErrors: result.errors });
    case "conflict":
      return failure(409, "conflict", "This form was changed in another tab or by our team. Reload to see the latest version.", { current: result.current });
    case "invalid_state":
      return failure(409, "invalid_state", "This form can no longer be edited.", { current: result.current });
  }
}
