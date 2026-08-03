/**
 * Shared response conventions for /api/portal/* route handlers (ADR-001,
 * decision 5): `{ error: { code, message } }` on failure, generic messages
 * for anything auth-related so responses never reveal account existence.
 */

export type ApiErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "server_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  server_error: 500,
};

export function jsonError(code: ApiErrorCode, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status: STATUS_BY_CODE[code] },
  );
}

export function jsonOk(body: Record<string, unknown> = {}, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...body }, init);
}
