import "server-only";

import { redirect } from "next/navigation";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { getSessionActorFromCookieStore, getUnverifiedSessionFromCookieStore, type SessionActor } from "./session";

/**
 * Where a visitor with no usable session goes. Someone holding only the powerless
 * session of an unverified account (ADR-033) is sent to the welcome screen, which
 * explains how to unlock the portal, instead of a login page they cannot use.
 */
async function redirectToLoginOrWelcome(nextPath: string): Promise<never> {
  if (await getUnverifiedSessionFromCookieStore()) redirect("/portal");
  redirect(`/portal/login?next=${encodeURIComponent(nextPath)}`);
}

/**
 * Server Component guard for /portal/** pages: resolves the active session
 * to its ClientUser, or redirects to login with a safe `next` target.
 * Fails closed — any missing/expired session or inactive account redirects,
 * never falls through with a null client.
 */
export async function requireClient(nextPath: string) {
  const { client } = await requireClientSession(nextPath);
  return client;
}

/**
 * Same guard, but also returns the session actor.
 *
 * `/portal/security` needs the session id to mark which row in the device
 * list is the browser being used right now — the one piece of session
 * state a page cannot re-derive from the client record alone.
 */
export async function requireClientSession(nextPath: string) {
  const actor: SessionActor | null = await getSessionActorFromCookieStore();
  if (!actor) {
    return redirectToLoginOrWelcome(nextPath);
  }

  const db = getDb();
  if (db) await db;

  const client = db ? await ClientUser.findById(actor.clientUserId) : null;
  if (!client || client.status !== "active") {
    return redirectToLoginOrWelcome(nextPath);
  }

  return { client, actor };
}
