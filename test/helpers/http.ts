/**
 * Minimal helpers for driving /api/portal/* Route Handlers directly with
 * real `Request`/`Response` objects — no server process, no supertest. See
 * ADR-001 decision 8: a Route Handler is just `(Request) => Response`, so
 * importing the module and calling it is already a real, HTTP-shaped
 * integration test.
 */

export const TEST_ORIGIN = "http://localhost:3000";

let ipCounter = 0;
/**
 * The app's IP-keyed rate limiter (src/lib/rate-limit.ts) is a
 * process-wide in-memory Map, shared across every test in this process. A
 * fresh IP per call (the default here) means unrelated tests never trip
 * each other's rate limit — only the tests that intentionally reuse the
 * same `ip` exercise that behavior.
 */
export function nextTestIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 255)}.${ipCounter % 255}`;
}

export function jsonRequest(
  path: string,
  body: unknown,
  init: { cookie?: string; origin?: string | null; ip?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.origin !== null) headers.set("origin", init.origin ?? TEST_ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  headers.set("x-forwarded-for", init.ip ?? nextTestIp());

  return new Request(`${TEST_ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Extracts `<name>=<value>` from a response's Set-Cookie header, ignoring attributes. */
export function extractCookie(res: Response, name: string): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const first = setCookie.split(";")[0];
  const eq = first.indexOf("=");
  if (eq === -1) return null;
  const key = first.slice(0, eq);
  const value = first.slice(eq + 1);
  return key === name ? value : null;
}

export function cookieHeader(name: string, value: string): string {
  return `${name}=${value}`;
}
