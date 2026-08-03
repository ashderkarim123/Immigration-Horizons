import "server-only";

import { WorkspaceMember } from "../models/WorkspaceMember";

/**
 * The one documented exception to this app being read-only against
 * Case/Workspace/Membership collections (ADR-002 §1) — called by
 * src/app/api/portal/activate/route.ts immediately after a ClientUser is
 * created. Extracted into its own function so it's directly unit-testable
 * without needing a second, impossible-to-arrange real activation request
 * (activation tokens are single-use, and a membership can only reference a
 * clientUser id that doesn't exist until activation creates it — see
 * test/case-authorization.integration.test.ts for why this is tested here
 * rather than end-to-end through the route).
 */
export async function activateInvitedMembershipsForClient(clientUserId: string): Promise<number> {
  const result = await WorkspaceMember.updateMany(
    { clientUser: clientUserId, memberType: "client", status: "invited" },
    { $set: { status: "active", joinedAt: new Date() } },
  );
  return result.modifiedCount;
}
