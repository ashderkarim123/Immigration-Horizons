import "server-only";

import {
  destroyEmployeeSession,
  getEmployeeActor,
  serializeClearedEmployeeSessionCookie,
} from "@/lib/auth/employee-session";
import { verifyOrigin } from "@/lib/auth/csrf";
import { jsonOk, jsonError } from "@/lib/auth/http";
import { recordSecurityEvent } from "@/lib/security/security-events";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "staff",
      actorType: "anonymous",
      request,
      meta: { route: "/api/staff/logout" },
    });
    return jsonError("forbidden", "Request rejected.");
  }

  // Resolved before the row is deleted — afterwards the event could not be
  // attributed to an employee.
  const actor = await getEmployeeActor(request);

  // Revoke the row first, then clear the cookie — if the delete fails the
  // session must not be left live with the cookie already gone.
  await destroyEmployeeSession(request);

  if (actor) {
    await recordSecurityEvent({
      type: "logout",
      result: "success",
      surface: "staff",
      actorType: "admin_user",
      actorAdminId: actor.adminUserId,
      request,
      meta: { role: actor.role },
    });
  }

  const response = jsonOk({ redirectTo: "/staff/login" });
  response.headers.set("Set-Cookie", serializeClearedEmployeeSessionCookie());
  return response;
}
