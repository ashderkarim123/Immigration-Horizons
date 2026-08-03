import "server-only";

import { destroySession, serializeClearedSessionCookie } from "../../../../lib/auth/session";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { jsonError, jsonOk } from "../../../../lib/auth/http";

export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");

  await destroySession(request);

  return jsonOk(
    { redirectTo: "/portal/login" },
    { headers: { "Set-Cookie": serializeClearedSessionCookie() } },
  );
}
