import "server-only";

import { guardStaffRequest, requireCaseAccess, readJsonBody } from "@/lib/auth/staff-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { addEmployeeMember } from "@/lib/staff/case-operations";

/**
 * Add (or reactivate) an employee on a case workspace (ADR-010 §3).
 *
 * Capability: `workspace.members.manage` (super_admin, admin, pm).
 *
 * This is the capability that widens someone else's access, so it is the
 * one place where the row-level check protects against a PM adding
 * themselves to a case they cannot see: `requireCaseAccess` runs first,
 * and a PM who is not already a member of the case fails it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const guard = await guardStaffRequest(request, {
    capability: "workspace.members.manage",
    rateLimitBucket: "staff-case-members",
  });
  if (!guard.ok) return guard.response;

  const { caseId } = await params;
  const access = await requireCaseAccess(caseId, guard.context.actor);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const adminUserId = parsed.body.adminUserId;
  if (typeof adminUserId !== "string" || !adminUserId) {
    return jsonError("invalid_input", "Choose a team member.");
  }

  const result = await addEmployeeMember({
    caseDoc: access.caseDoc,
    workspace: access.workspace,
    adminUserId,
    workspaceRole: typeof parsed.body.workspaceRole === "string" ? parsed.body.workspaceRole : undefined,
    clientVisible:
      typeof parsed.body.clientVisible === "boolean" ? parsed.body.clientVisible : undefined,
    actor: { id: guard.context.actor.adminUserId, name: guard.context.actorName },
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", result.message);
  if (result.outcome === "not_found") return jsonError("not_found", "That case could not be found.");

  return jsonOk({ outcome: result.outcome });
}
