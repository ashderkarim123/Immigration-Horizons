import "server-only";

import { verifyOrigin } from "@/lib/auth/csrf";
import { lookupUnverifiedSessionByToken, serializeSessionCookie } from "@/lib/auth/session";
import { isRateLimited } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security/security-events";

/**
 * Hand-off from the public site's thank-you page to the portal (ADR-033 §3).
 *
 * The form is submitted on the public host, but the session cookie is host-only,
 * so it is set here, on the portal host. The token arrives in a POST body, never
 * a URL, so it cannot reach analytics, logs or Referer headers, and a link
 * prefetcher cannot consume it.
 *
 * Only a live session of an UNVERIFIED account is accepted. The token is the
 * session the account's creation issued; anything else, a verified account's
 * session included, is refused, so this route can never be used to move or
 * mint a real client's session.
 */
function redirect(location: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Location", location);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request): Promise<Response> {
  const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!verifyOrigin(request, publicOrigin ? [publicOrigin] : [])) {
    await recordSecurityEvent({
      type: "csrf_rejected",
      result: "denied",
      surface: "portal",
      actorType: "anonymous",
      request,
      meta: { route: "/portal/welcome" },
    });
    return new Response("Request rejected.", { status: 403 });
  }
  if (await isRateLimited("portal-welcome", request)) {
    return new Response("Too many attempts. Please try again later.", { status: 429 });
  }

  let token: string | null = null;
  try {
    const value = (await request.formData()).get("token");
    token = typeof value === "string" && value ? value : null;
  } catch {
    token = null;
  }

  const actor = await lookupUnverifiedSessionByToken(token);
  if (!token || !actor) return redirect("/portal/login");

  return redirect("/portal", { headers: { "Set-Cookie": serializeSessionCookie(token) } });
}
