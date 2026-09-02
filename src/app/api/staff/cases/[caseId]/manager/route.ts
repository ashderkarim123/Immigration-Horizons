import "server-only";

import { guardStaffRequest, requireCaseAccess, readJsonBody } from "@/lib/auth/staff-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { changeProjectManager } from "@/lib/staff/case-operations";

/**
 * Assign or change a case's project manager (ADR-010 §3).
 *
 * Capability: `cases.assign` (super_admin, admin). Row-level: the actor
 * must already be able to open this case — a `cases.assign` holder who
 * cannot see the case cannot reassign it either, since both roles holding
 * that capability also hold `cases.view_all` today, and the check stays in
 * place so a future narrower grant is scoped by default rather than by a
 * later edit here.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const guard = await guardStaffRequest(request, {
    capability: "cases.assign",
    rateLimitBucket: "staff-case-assign",
  });
  if (!guard.ok) return guard.response;

  const { caseId } = await params;
  const access = await requireCaseAccess(caseId, guard.context.actor);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const projectManagerId = parsed.body.projectManagerId;
  if (typeof projectManagerId !== "string" || !projectManagerId) {
    return jsonError("invalid_input", "Choose a project manager.");
  }

  const result = await changeProjectManager({
    caseDoc: access.caseDoc,
    workspace: access.workspace,
    newManagerId: projectManagerId,
    actor: { id: guard.context.actor.adminUserId, name: guard.context.actorName },
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", result.message);
  if (result.outcome === "not_found") return jsonError("not_found", "That case could not be found.");

  return jsonOk({ outcome: result.outcome });
}
