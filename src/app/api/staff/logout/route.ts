import "server-only";

import { destroyEmployeeSession, serializeClearedEmployeeSessionCookie } from "@/lib/auth/employee-session";
import { verifyOrigin } from "@/lib/auth/csrf";
import { jsonOk, jsonError } from "@/lib/auth/http";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");

  // Revoke the row first, then clear the cookie — if the delete fails the
  // session must not be left live with the cookie already gone.
  await destroyEmployeeSession(request);

  const response = jsonOk({ redirectTo: "/staff/login" });
  response.headers.set("Set-Cookie", serializeClearedEmployeeSessionCookie());
  return response;
}
