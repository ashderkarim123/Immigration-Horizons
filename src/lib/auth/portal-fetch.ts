/**
 * Client-side helper for the portal auth forms — posts JSON to an
 * /api/portal/* Route Handler and normalizes its `{ ok, error }` /
 * `{ ok, redirectTo }` response shape (see src/lib/auth/http.ts).
 */

export type PortalApiResult =
  | { ok: true; redirectTo?: string; message?: string }
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

  return { ok: true, redirectTo: data?.redirectTo, message: data?.message };
}
