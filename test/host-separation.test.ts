import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { NextRequest } from "next/server";

import { classifyHost, isAppPath, normalizeHost, APP_HOST, PUBLIC_HOST } from "../src/lib/hosts";
import { proxy } from "../src/proxy";

/**
 * Host boundary tests (ADR-008). These verify *routing*, not authorization:
 * every portal page and API route keeps its own session and row-level
 * checks regardless of what the proxy does, and those are covered by the
 * existing portal/document/collaboration/notification suites.
 */

function request(host: string, path: string, forwarded?: string) {
  const headers = new Headers();
  headers.set("host", host);
  if (forwarded) headers.set("x-forwarded-host", forwarded);
  return new NextRequest(new URL(`https://${host}${path}`), { headers });
}

// ---------------------------------------------------------------------------
// Host classification
// ---------------------------------------------------------------------------

test("normalizeHost strips port, casing, and a proxy comma-list", () => {
  assert.equal(normalizeHost("App.Immigrationhorizons.com:443"), "app.immigrationhorizons.com");
  assert.equal(normalizeHost("immigrationhorizons.com, other.example"), "immigrationhorizons.com");
  assert.equal(normalizeHost(null), "");
});

test("classifyHost distinguishes the three hosts and folds www into public", () => {
  assert.equal(classifyHost(PUBLIC_HOST), "public");
  assert.equal(classifyHost(`www.${PUBLIC_HOST}`), "public");
  assert.equal(classifyHost(APP_HOST), "app");
  assert.equal(classifyHost("admin.immigrationhorizons.com"), "admin");
});

test("an unrecognised host is 'unknown', not silently treated as public", () => {
  assert.equal(classifyHost("localhost"), "unknown");
  assert.equal(classifyHost("192.168.1.10"), "unknown");
  assert.equal(classifyHost(""), "unknown");
});

test("isAppPath matches the SaaS surface and nothing adjacent to it", () => {
  assert.ok(isAppPath("/portal"));
  assert.ok(isAppPath("/portal/cases/abc"));
  assert.ok(isAppPath("/api/portal/login"));
  // Cycle 8B — the staff half of the same application.
  assert.ok(isAppPath("/staff"));
  assert.ok(isAppPath("/staff/cases/abc"));
  assert.ok(isAppPath("/api/staff/login"));
  assert.ok(!isAppPath("/staffing-agency"));
  assert.ok(!isAppPath("/"));
  assert.ok(!isAppPath("/services/eb1a"));
  // A marketing route that merely starts with the same letters must not
  // be captured by a sloppy prefix check.
  assert.ok(!isAppPath("/portals-of-immigration"));
  assert.ok(!isAppPath("/blog/portal-guide"));
});

// ---------------------------------------------------------------------------
// Public host
// ---------------------------------------------------------------------------

test("public host serves marketing pages untouched", () => {
  const res = proxy(request(PUBLIC_HOST, "/services/eb1a"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-middleware-rewrite"), null);
});

test("public host redirects the SaaS surface to app.*, preserving path and query", () => {
  const res = proxy(request(PUBLIC_HOST, "/portal/cases/abc123?tab=documents"));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), `https://${APP_HOST}/portal/cases/abc123?tab=documents`);
});

test("public host redirects portal API calls to app.* too", () => {
  const res = proxy(request(PUBLIC_HOST, "/api/portal/login"));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), `https://${APP_HOST}/api/portal/login`);
});

test("marketing pages on the public host are NOT marked noindex", () => {
  const res = proxy(request(PUBLIC_HOST, "/about"));
  assert.equal(res.headers.get("X-Robots-Tag"), null);
});

// ---------------------------------------------------------------------------
// App host
// ---------------------------------------------------------------------------

test("app host rewrites / to the portal dashboard", () => {
  const res = proxy(request(APP_HOST, "/"));
  assert.ok(res.headers.get("x-middleware-rewrite")?.endsWith("/portal"));
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("app host serves the SaaS surface and marks every response noindex", () => {
  for (const path of ["/portal", "/portal/cases", "/api/portal/login"]) {
    const res = proxy(request(APP_HOST, path));
    assert.equal(res.status, 200, `${path} should pass through`);
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow", `${path} must be noindex`);
  }
});

test("app host sends marketing URLs back to the public site rather than 404ing", () => {
  const res = proxy(request(APP_HOST, "/services/eb1a"));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), `https://${PUBLIC_HOST}/services/eb1a`);
});

test("app host root routes staff to /staff and everyone else to /portal", () => {
  const anonymous = proxy(request(APP_HOST, "/"));
  assert.ok(anonymous.headers.get("x-middleware-rewrite")?.endsWith("/portal"));

  const headers = new Headers();
  headers.set("host", APP_HOST);
  headers.set("cookie", "ih_staff_session=some-opaque-token");
  const staff = proxy(new NextRequest(new URL(`https://${APP_HOST}/`), { headers }));
  assert.ok(staff.headers.get("x-middleware-rewrite")?.endsWith("/staff"));
  assert.equal(staff.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("the staff surface is noindex and stays on the app host", () => {
  for (const path of ["/staff", "/staff/cases", "/api/staff/login"]) {
    const onApp = proxy(request(APP_HOST, path));
    assert.equal(onApp.status, 200, `${path} should pass through on app.*`);
    assert.equal(onApp.headers.get("X-Robots-Tag"), "noindex, nofollow");

    const onPublic = proxy(request(PUBLIC_HOST, path));
    assert.equal(onPublic.status, 308, `${path} must not be served on the public host`);
    assert.equal(onPublic.headers.get("location"), `https://${APP_HOST}${path}`);
  }
});

test("app host serves its OWN robots.txt instead of forwarding to the public one", () => {
  // Regression: /robots.txt is not an app path, so an unqualified
  // "redirect everything non-app to the public host" rule sent crawlers to
  // the public `Allow: /` robots and undid the indexing isolation.
  const res = proxy(request(APP_HOST, "/robots.txt"));
  assert.equal(res.status, 200, "must be served locally, not redirected");
  assert.equal(res.headers.get("location"), null);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("the app host redirect does not loop: its target is an app path that passes through", () => {
  const redirected = proxy(request(PUBLIC_HOST, "/portal/cases"));
  const target = new URL(redirected.headers.get("location")!);
  assert.equal(target.host, APP_HOST);

  const followed = proxy(request(APP_HOST, target.pathname));
  assert.equal(followed.status, 200, "following the redirect must terminate, not bounce back");
});

// ---------------------------------------------------------------------------
// x-forwarded-host (behind nginx)
// ---------------------------------------------------------------------------

test("x-forwarded-host wins over host, so nginx-proxied requests classify correctly", () => {
  // Upstream Host is the internal origin; the real host is forwarded.
  const res = proxy(request("127.0.0.1:3000", "/services/eb1a", APP_HOST));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), `https://${PUBLIC_HOST}/services/eb1a`);
});

// ---------------------------------------------------------------------------
// Single-host mode (local dev / previews)
// ---------------------------------------------------------------------------

test("an unknown host keeps both surfaces reachable so local development still works", () => {
  const marketing = proxy(request("localhost:3000", "/services/eb1a"));
  assert.equal(marketing.status, 200);

  const portal = proxy(request("localhost:3000", "/portal/cases"));
  assert.equal(portal.status, 200, "portal must not redirect away in single-host mode");
});

test("app paths are still marked noindex in single-host mode", () => {
  const res = proxy(request("localhost:3000", "/portal/cases"));
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
});
