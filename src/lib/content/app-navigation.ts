/**
 * Navigation definitions for the SaaS app (ADR-009 §6, extended in
 * ADR-011 §1).
 *
 * **Navigation is presentation, not authorization.** Every item here is
 * filtered by capability purely so the UI does not offer dead ends — the
 * server re-checks on every page and route regardless, and a hand-typed
 * URL to a hidden item is denied by `requireCapability` plus the
 * row-level policy, not by this file.
 *
 * The two actor types have entirely separate lists and never share one.
 * A client's navigation is a fixed constant with no capability field at
 * all, so there is no code path by which a capability check could
 * accidentally surface a staff destination to a client.
 *
 * Dependency-free so it can be imported from client components.
 */

export type NavItem = {
  label: string;
  href: string;
  /** Omitted = always shown to this actor type. */
  capability?: string;
};

/**
 * Client primary navigation. Clients have no capabilities — this is fixed,
 * and every href is under `/portal`, asserted by test.
 *
 * Documents and messages are deliberately absent: both are case-scoped
 * (`/portal/cases/:id/documents`, `/portal/cases/:id/messages`) and no
 * cross-case index exists, so a top-level entry would be a dead end.
 */
export const CLIENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/portal" },
  { label: "Cases", href: "/portal/cases" },
  { label: "Consultations", href: "/portal/consultations" },
  { label: "Questions", href: "/portal/queries" },
];

/**
 * Client account destinations. These live in the account menu rather than
 * the primary nav — they are things you visit occasionally, and the
 * primary nav should stay the four places a client actually works.
 */
export const CLIENT_ACCOUNT_NAV: NavItem[] = [
  { label: "Profile", href: "/portal/profile" },
  { label: "Security", href: "/portal/security" },
  { label: "Notification preferences", href: "/portal/notifications/preferences" },
];

/** Employee navigation, filtered by capability at render time. */
export const EMPLOYEE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/staff" },
  // No capability: every queue on the operations board is gated
  // individually, so the page is useful (and honest about what it cannot
  // show) for any role.
  { label: "Operations", href: "/staff/operations" },
  { label: "Cases", href: "/staff/cases", capability: "cases.view" },
  { label: "Clients", href: "/staff/clients", capability: "clients.view" },
  { label: "Queries", href: "/staff/queries", capability: "queries.view" },
  { label: "Tasks", href: "/staff/tasks" },
];

export function visibleEmployeeNav(can: (capability: string) => boolean): NavItem[] {
  return EMPLOYEE_NAV.filter((item) => !item.capability || can(item.capability));
}
