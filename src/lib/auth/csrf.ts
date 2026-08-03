import "server-only";

/**
 * CSRF mitigation for cookie-authenticated mutating routes (ADR-001,
 * decision 4). Requires the request's Origin (falling back to Referer) to
 * match the app's own origin — in addition to, not instead of,
 * SameSite=Lax on the session cookie.
 */
export function verifyOrigin(request: Request): boolean {
  const origin =
    request.headers.get("origin") ||
    (() => {
      const referer = request.headers.get("referer");
      if (!referer) return null;
      try {
        return new URL(referer).origin;
      } catch {
        return null;
      }
    })();

  if (!origin) {
    // Same-origin browser requests always send Origin on state-changing
    // methods (and Referer as a fallback for older browsers); a request
    // with neither is not a normal same-origin browser submission.
    return false;
  }

  const expected =
    process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;

  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
