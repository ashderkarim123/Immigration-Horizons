import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { APP_HOST, PUBLIC_HOST, classifyHost, isAppPath } from "./lib/hosts";

/**
 * Name only — deliberately not imported from `lib/auth/employee-session`,
 * which pulls in Mongoose and `server-only` and cannot load in the proxy
 * runtime.
 */
const EMPLOYEE_SESSION_COOKIE = "ih_staff_session";

/**
 * Host-based application boundary (ADR-008).
 *
 * Next 16 renamed Middleware to Proxy; the convention is a `proxy.ts` at
 * the same level as `app/`, exporting `proxy` (or a default) plus a
 * `config.matcher`.
 *
 * What this does:
 *   - keeps the SaaS surface (/portal, /api/portal) on app.* only
 *   - keeps the marketing surface on the public host only
 *   - stamps `X-Robots-Tag: noindex, nofollow` on everything app.* serves
 *
 * What this deliberately does NOT do: authenticate or authorize. The Next
 * docs are explicit that proxy "should not be used as a full session
 * management or authorization solution", and the brief for this cycle says
 * the same thing — a host check is routing, never a permission. Every
 * portal page and API route keeps its own session check and row-level
 * policy exactly as before; nothing here is load-bearing for security.
 * If this file were deleted, the app would leak *URLs across hosts*, not
 * data.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Behind nginx the real host arrives as x-forwarded-host; `host` is the
  // upstream. Fall back so this also works when served directly.
  const kind = classifyHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  const appPath = isAppPath(pathname);

  // Single-host mode: local development, previews, direct IP access. All
  // three surfaces share one origin there, so enforcing the split would
  // make the whole thing untestable locally. Still mark app paths noindex.
  if (kind === "unknown") {
    const response = NextResponse.next();
    if (appPath) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (kind === "app") {
    // The SaaS host has no marketing surface. `/` is whichever dashboard
    // fits the visitor: staff land on /staff, everyone else on /portal.
    //
    // This reads only the PRESENCE of the staff cookie, never its value —
    // it is a routing hint, not a login. A forged or expired cookie simply
    // lands on /staff, which then redirects to /staff/login like any other
    // unauthenticated request (ADR-009 §3).
    if (pathname === "/") {
      const target = request.cookies.has(EMPLOYEE_SESSION_COOKIE) ? "/staff" : "/portal";
      const response = NextResponse.rewrite(new URL(target, request.url));
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return response;
    }

    // /robots.txt must be answered by THIS host, not forwarded. robots.ts
    // is host-aware and serves a blanket disallow for app.*; redirecting it
    // to the public host would hand crawlers the public "Allow: /" instead
    // and silently undo the indexing isolation. Caught by a live smoke
    // test — the unit tests all passed while this was broken.
    if (pathname !== "/robots.txt" && !appPath) {
      // Any other marketing URL reached on app.* — send it to where it
      // actually lives rather than 404ing, so shared links keep working.
      return NextResponse.redirect(new URL(`https://${PUBLIC_HOST}${pathname}${search}`), 308);
    }

    const response = NextResponse.next();
    // Belt and braces: every portal page already sets `robots: noindex` in
    // its own metadata, but a header covers API responses and anything
    // rendered outside the metadata system too.
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Public marketing host: the SaaS surface does not exist here. Redirect
  // rather than 404 so existing /portal bookmarks and the activation and
  // password-reset links already sitting in people's inboxes keep working.
  if (kind === "public" && appPath) {
    return NextResponse.redirect(new URL(`https://${APP_HOST}${pathname}${search}`), 308);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own build output and the static files served
  // from /public. robots.txt and sitemap.xml are intentionally NOT excluded
  // in spirit — they're handled by host-aware route handlers instead, which
  // keeps the logic in one readable place rather than split across two.
  matcher: [
    "/((?!_next/static|_next/image|images|fonts|favicon.ico|apple-touch-icon.png|site.webmanifest).*)",
  ],
};
