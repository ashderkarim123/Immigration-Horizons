/**
 * Navigation definitions for the SaaS app (ADR-009 §6).
 *
 * **Navigation is presentation, not authorization.** Every item here is
 * filtered by capability purely so the UI does not offer dead ends — the
 * server re-checks on every page and route regardless, and a hand-typed
 * URL to a hidden item is denied by `requireCapability` plus the
 * row-level policy, not by this file.
 *
 * Dependency-free so it can be imported from client components.
 */

export type NavItem = {
  label: string;
  href: string;
  /** Omitted = always shown to this actor type. */
  capability?: string;
};

/** Client-side portal navigation. Clients have no capabilities — this is fixed. */
export const CLIENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/portal" },
  { label: "Cases", href: "/portal/cases" },
  { label: "Consultations", href: "/portal/consultations" },
  { label: "Questions", href: "/portal/queries" },
  { label: "Notifications", href: "/portal/notifications" },
];

/** Employee navigation, filtered by capability at render time. */
export const EMPLOYEE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/staff" },
  { label: "Cases", href: "/staff/cases", capability: "cases.view" },
  { label: "Tasks", href: "/staff/tasks" },
  { label: "Queries", href: "/staff/queries", capability: "queries.view" },
  { label: "Clients", href: "/staff/clients", capability: "clients.view" },
];

export function visibleEmployeeNav(can: (capability: string) => boolean): NavItem[] {
  return EMPLOYEE_NAV.filter((item) => !item.capability || can(item.capability));
}
