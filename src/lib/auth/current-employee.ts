import "server-only";

import { redirect } from "next/navigation";

import { getEmployeeActorFromCookieStore } from "./employee-session";
import { roleHasCapability, capabilitiesForRole } from "./capabilities";
import type { EmployeeActor } from "./actors";

/**
 * Server-side employee guards (ADR-009 §4).
 *
 * These are the enforcement point. Navigation is built from the same
 * capability data, but hiding a link is *presentation* — every page and
 * route handler in the staff area calls one of these, and every
 * case-scoped resource additionally runs its own row-level workspace
 * check (casePolicy / documentPolicy / collaborationPolicy), unchanged
 * from earlier cycles.
 */

export type EmployeeSessionContext = {
  actor: EmployeeActor;
  role: string;
  capabilities: string[];
  can: (capability: string) => boolean;
};

function contextFor(actor: EmployeeActor): EmployeeSessionContext {
  return {
    actor,
    role: actor.role,
    capabilities: capabilitiesForRole(actor.role),
    can: (capability: string) => roleHasCapability(actor.role, capability),
  };
}

/** Returns the employee context, or null when there is no valid staff session. */
export async function getEmployeeContext(): Promise<EmployeeSessionContext | null> {
  const actor = await getEmployeeActorFromCookieStore();
  if (!actor) return null;
  return contextFor(actor);
}

/**
 * Requires a signed-in employee. Redirects to the staff sign-in with a
 * `next` parameter so the original destination survives the round trip.
 */
export async function requireEmployee(nextPath = "/staff"): Promise<EmployeeSessionContext> {
  const context = await getEmployeeContext();
  if (!context) redirect(`/staff/login?next=${encodeURIComponent(nextPath)}`);
  return context;
}

/**
 * Requires a signed-in employee holding a specific capability.
 *
 * A signed-in employee without the capability gets a 404, not a 403: the
 * existence of a resource they cannot access is itself information, and
 * this matches how the client portal already treats unauthorized cases
 * (`getAccessibleCase` returns null → notFound).
 */
export async function requireCapability(
  capability: string,
  nextPath = "/staff",
): Promise<EmployeeSessionContext> {
  const context = await requireEmployee(nextPath);
  if (!context.can(capability)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return context;
}
