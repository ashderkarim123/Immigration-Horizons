/**
 * Host topology for the three-application split (ADR-008).
 *
 * Deliberately dependency-free and edge-safe: `src/proxy.ts` runs in the
 * proxy runtime and cannot import anything that pulls in Mongoose, Node
 * built-ins, or `server-only`. Keep it that way.
 */

/** The public marketing site — the only host that participates in organic search. */
export const PUBLIC_HOST = (process.env.NEXT_PUBLIC_PUBLIC_HOST ?? "immigrationhorizons.com").toLowerCase();

/** The SaaS case-management application (clients + case-working employees). */
export const APP_HOST = (process.env.NEXT_PUBLIC_APP_HOST ?? "app.immigrationhorizons.com").toLowerCase();

/**
 * The Express/EJS admin CMS. Not served by this Next.js runtime at all —
 * declared here only so robots/sitemap logic and documentation share one
 * source of truth for the topology.
 */
export const ADMIN_HOST = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.immigrationhorizons.com").toLowerCase();

export type HostKind = "public" | "app" | "admin" | "unknown";

/** Strips the port and lowercases; `x-forwarded-host` wins behind a proxy. */
export function normalizeHost(rawHost: string | null | undefined): string {
  return (rawHost ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
}

/**
 * Classifies a request host. `www.` is folded into the public site.
 *
 * Anything unrecognised — localhost, a LAN IP, a preview deployment — is
 * `unknown`, and callers must treat that as "single-host mode" rather than
 * as a host to lock down. Local development serves all three surfaces from
 * one origin, and breaking that would make the split untestable.
 */
export function classifyHost(rawHost: string | null | undefined): HostKind {
  const host = normalizeHost(rawHost);
  if (!host) return "unknown";
  if (host === APP_HOST) return "app";
  if (host === ADMIN_HOST) return "admin";
  if (host === PUBLIC_HOST || host === `www.${PUBLIC_HOST}`) return "public";
  return "unknown";
}

/**
 * Paths owned by the SaaS application. Everything else in this Next.js
 * app belongs to the public marketing site.
 *
 * This is a routing fact, not an authorization decision — every one of
 * these paths still runs its own session and row-level checks. See
 * ADR-008 §4.
 */
export function isAppPath(pathname: string): boolean {
  return (
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/api/portal" ||
    pathname.startsWith("/api/portal/") ||
    // Cycle 8B — the employee half of the same SaaS application.
    pathname === "/staff" ||
    pathname.startsWith("/staff/") ||
    pathname === "/api/staff" ||
    pathname.startsWith("/api/staff/")
  );
}
