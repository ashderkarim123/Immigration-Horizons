import "server-only";

import { jsonOk } from "@/lib/auth/http";
import { toClientDto } from "@/lib/forms/form-service";
import { loadFormForRoute } from "@/lib/forms/portal-form-route";

/** The client's current view of one form — also how the editor reloads after a conflict. */
export async function GET(request: Request, { params }: { params: Promise<{ formId: string }> }): Promise<Response> {
  const result = await loadFormForRoute(request, params, { rateLimitBucket: "portal-form-read", readOnly: true });
  if (!result.ok) return result.response;
  const { form, template } = result.loaded;
  return jsonOk({ form: toClientDto(form, template) });
}
