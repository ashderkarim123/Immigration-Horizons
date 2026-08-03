/**
 * Explicit actor identity types (ADR-001, decision 6). Never infer an
 * actor's type from a route name or a role string alone — always construct
 * one from a verified session/credential lookup.
 */

export type ClientActor = {
  type: "client";
  clientUserId: string;
};

/**
 * Not populated by any code in this cycle — the Express admin app owns
 * employee sessions and stays on its own auth system. Typed here so a
 * future cross-app authorization policy (e.g. Cycle 2 case/workspace
 * access, which both a client and an employee can hold membership in) has
 * a stable shape to target without retrofitting this union later.
 */
export type EmployeeActor = {
  type: "employee";
  adminUserId: string;
  role: string;
};

export type SystemActor = {
  type: "system";
  service: string;
};

export type Actor = ClientActor | EmployeeActor | SystemActor;
