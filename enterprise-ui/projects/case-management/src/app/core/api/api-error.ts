interface ApiErrorBody {
  error?: { message?: string | null; fieldErrors?: { message?: string }[] | null };
}

/** Extracts the user-facing message from the Express `{ error: { message, fieldErrors } }` envelope. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const body = (err as { error?: ApiErrorBody })?.error?.error;
  const field = body?.fieldErrors?.[0]?.message;
  if (field) return field;
  const message = body?.message;
  return message && message !== 'null' ? message : fallback;
}
