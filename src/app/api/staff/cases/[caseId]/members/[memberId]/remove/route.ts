import "server-only";

import { guardStaffRequest, requireCaseAccess } from "@/lib/auth/staff-api";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { removeMemberFromCase } from "@/lib/staff/case-operations";

/**
 * Remove a member from a case workspace (ADR-010 §3). Soft removal only —
 * the row is marked `removed`, never deleted, so the case keeps its
 * history.
 *
 * POST rather than DELETE because this is a browser form submission that
 * must carry the Origin header the CSRF check reads, and because the
 * response redirects the operator back to the case.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string; memberId: string }> },
): Promise<Response> {
  const guard = await guardStaffRequest(request, {
    capability: "workspace.members.manage",
    rateLimitBucket: "staff-case-members",
  });
  if (!guard.ok) return guard.response;

  const { caseId, memberId } = await params;
  const access = await requireCaseAccess(caseId, guard.context.actor);
  if (!access.ok) return access.response;

  const result = await removeMemberFromCase({
    caseDoc: access.caseDoc,
    workspace: access.workspace,
    memberId,
    actor: { id: guard.context.actor.adminUserId, name: guard.context.actorName },
  });

  if (result.outcome === "validation_error") return jsonError("unprocessable", result.message);
  if (result.outcome === "not_found") return jsonError("not_found", "That member could not be found.");

  return jsonOk({ outcome: result.outcome });
}
