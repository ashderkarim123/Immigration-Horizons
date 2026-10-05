interface ApiErrorBody {
  error?: { code?: string; message?: string | null; fieldErrors?: { field?: string; message?: string }[] | null };
}

const bodyOf = (err: unknown) => (err as { error?: ApiErrorBody })?.error?.error;

/** Extracts the user-facing message from the Express `{ error: { message, fieldErrors } }` envelope. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const body = bodyOf(err);
  const field = body?.fieldErrors?.[0]?.message;
  if (field) return field;
  const message = body?.message;
  return message && message !== 'null' ? message : fallback;
}

/** The machine code of an Express error envelope (e.g. `conflict`, `provider_unavailable`), or ''. */
export function apiErrorCode(err: unknown): string {
  return bodyOf(err)?.code ?? '';
}

/** `{ field: message }` from the envelope's fieldErrors, so a form can show each error beside its input. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of bodyOf(err)?.fieldErrors ?? []) if (e.field && e.message && !out[e.field]) out[e.field] = e.message;
  return out;
}
