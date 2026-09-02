/**
 * Client-side helper for the portal auth forms — posts JSON to an
 * /api/portal/* Route Handler and normalizes its `{ ok, error }` /
 * `{ ok, redirectTo }` response shape (see src/lib/auth/http.ts).
 */

export type PortalApiResult =
  | { ok: true; redirectTo?: string; message?: string; outcome?: string }
  | { ok: false; error: { code: string; message: string } };

export async function postPortalJson(
  path: string,
  body: unknown,
): Promise<PortalApiResult> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: { code: "network_error", message: "Network error. Please try again." },
    };
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      error: data?.error ?? {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }

  return { ok: true, redirectTo: data?.redirectTo, message: data?.message, outcome: data?.outcome };
}

/**
 * The same helper under the name the staff console uses. Both apps share
 * one `{ ok, error }` response contract (src/lib/auth/http.ts), so they
 * share one client helper rather than two identical ones — the alias
 * exists only so `/api/staff/*` call sites do not read as portal calls.
 */
export const postAppJson = postPortalJson;

/**
 * Same response normalization as postPortalJson, for a multipart file
 * upload — deliberately no Content-Type header set, so the browser fills
 * in the multipart boundary itself.
 */
export async function postPortalFormData(
  path: string,
  formData: FormData,
): Promise<PortalApiResult & { documentId?: string }> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", body: formData });
  } catch {
    return {
      ok: false,
      error: { code: "network_error", message: "Network error. Please try again." },
    };
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      error: data?.error ?? {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }

  return { ok: true, redirectTo: data?.redirectTo, message: data?.message, documentId: data?.documentId };
}
