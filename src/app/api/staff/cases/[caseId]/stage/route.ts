import "server-only";

import { guardStaffRequest, requireCaseAccess, readJsonBody } from "@/lib/auth/staff-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { updateCaseStage } from "@/lib/staff/case-operations";

/**
 * Move a case to a new stage (ADR-010 §3).
 *
 * Capability: `cases.manage` (super_admin, admin, pm). A PM without
 * `cases.view_all` still passes the row-level check, so they can only
 * advance cases they are a member of.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const guard = await guardStaffRequest(request, {
    capability: "cases.manage",
    rateLimitBucket: "staff-case-stage",
  });
  if (!guard.ok) return guard.response;

  const { caseId } = await params;
  const access = await requireCaseAccess(caseId, guard.context.actor);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const stage = parsed.body.stage;
  if (typeof stage !== "string" || !stage) {
    return jsonError("invalid_input", "Choose a stage.");
  }

  const result = await updateCaseStage({
    caseDoc: access.caseDoc,
    workspace: access.workspace,
    newStage: stage,
    actor: { id: guard.context.actor.adminUserId, name: guard.context.actorName },
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", result.message);
  if (result.outcome === "not_found") return jsonError("not_found", "That case could not be found.");

  return jsonOk({ outcome: result.outcome });
}
