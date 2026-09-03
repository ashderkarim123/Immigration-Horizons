import "server-only";

import { getDb } from "../db";
import { AdminUser } from "../models/AdminUser";
import { getEmployeeActor } from "./employee-session";
import { roleHasCapability } from "./capabilities";
import { verifyOrigin } from "./csrf";
import { isRateLimited } from "../rate-limit";
import { jsonError } from "./http";
import { getAccessibleCaseWorkspace } from "./employee-case-policy";
import { recordSecurityEvent } from "../security/security-events";
import type { EmployeeActor } from "./actors";

/**
 * The gate every mutating /api/staff/* route passes through (ADR-010 §9).
 *
 * It exists so the four checks a staff mutation needs — Origin, rate
 * limit, an authenticated employee, and the governing capability — cannot
 * be assembled in a different order (or forgotten) route by route. Case
 * scope is the fifth check and is applied by `requireCaseAccess` below,
 * separately, because not every staff mutation is case-scoped.
 *
 * A signed-in employee lacking the capability gets **404, not 403**,
 * matching `requireCapability` on the page side: the existence of a
 * resource is itself information.
 *
 * Because the refusal is indistinguishable from "no such thing" to the
 * caller, the refusal is recorded (ADR-012 §4): the caller must not learn
 * that a capability boundary exists, but the operator must. This is the
 * only place staff-side denials are recorded, which is precisely why every
 * mutating staff route goes through it.
 */

export type StaffApiContext = {
  actor: EmployeeActor;
  /** Display name, for the activity entries these mutations record. */
  actorName: string;
};

export type StaffApiGuard =
  | { ok: true; context: StaffApiContext }
  | { ok: false; response: Response };

export async function guardStaffRequest(
  request: Request,
  options: { capability: string; rateLimitBucket: string },
): Promise<StaffApiGuard> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "staff",
      actorType: "anonymous",
      request,
      meta: { capability: options.capability },
    });
    return { ok: false, response: jsonError("forbidden", "Request rejected.") };
  }
  if (await isRateLimited(options.rateLimitBucket, request)) {
    return {
      ok: false,
      response: jsonError("rate_limited", "Too many requests. Please try again later."),
    };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, response: jsonError("server_error", "Service temporarily unavailable.") };
  }
  await db;

  // Re-reads AdminUser.role and isActive on every request (ADR-009 §3), so
  // a role change or deactivation in the admin CMS takes effect on the
  // next request rather than the next sign-in.
  const actor = await getEmployeeActor(request);
  if (!actor) {
    return { ok: false, response: jsonError("unauthenticated", "Please sign in.") };
  }

  if (!roleHasCapability(actor.role, options.capability)) {
    await recordSecurityEvent({
      type: "permission_denied",
      result: "denied",
      surface: "staff",
      actorType: "admin_user",
      actorAdminId: actor.adminUserId,
      request,
      meta: { capability: options.capability, role: actor.role },
    });
    return { ok: false, response: jsonError("not_found", "Not found.") };
  }

  const user = await AdminUser.findById(actor.adminUserId).select("name").lean();

  return {
    ok: true,
    context: {
      actor,
      actorName: String((user as { name?: string } | null)?.name || "A team member"),
    },
  };
}

export type CaseAccessGuard =
  | { ok: true; caseDoc: Record<string, unknown>; workspace: Record<string, unknown> }
  | { ok: false; response: Response };

/**
 * Row-level case scope for a mutation. Returns the exact case AND
 * workspace the access check ran against, so the mutation cannot end up
 * writing to a workspace re-derived from unvalidated input.
 *
 * "Not yours" and "does not exist" both return 404, identically.
 */
export async function requireCaseAccess(
  caseId: string,
  actor: EmployeeActor,
  request?: Request,
): Promise<CaseAccessGuard> {
  const loaded = await getAccessibleCaseWorkspace(caseId, actor);
  if (!loaded) {
    // Row-level refusals are the ones an attacker probes with — an
    // employee walking case ids they hold no membership on produces a run
    // of these against one actor.
    await recordSecurityEvent({
      type: "permission_denied",
      result: "denied",
      surface: "staff",
      actorType: "admin_user",
      actorAdminId: actor.adminUserId,
      request,
      meta: { scope: "case", caseId: String(caseId), role: actor.role },
    });
    return { ok: false, response: jsonError("not_found", "That case could not be found.") };
  }
  return {
    ok: true,
    caseDoc: loaded.caseDoc as Record<string, unknown>,
    workspace: loaded.workspace as Record<string, unknown>,
  };
}

/** Parses a JSON body, or returns the standard invalid-body response. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return { ok: false, response: jsonError("invalid_input", "Invalid request body.") };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, response: jsonError("invalid_input", "Invalid request body.") };
  }
}
