import "server-only";

import { redirect } from "next/navigation";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { getSessionActorFromCookieStore } from "./session";

/**
 * Server Component guard for /portal/** pages: resolves the active session
 * to its ClientUser, or redirects to login with a safe `next` target.
 * Fails closed — any missing/expired session or inactive account redirects,
 * never falls through with a null client.
 */
export async function requireClient(nextPath: string) {
  const actor = await getSessionActorFromCookieStore();
  if (!actor) {
    redirect(`/portal/login?next=${encodeURIComponent(nextPath)}`);
  }

  const db = getDb();
  if (db) await db;

  const client = db ? await ClientUser.findById(actor.clientUserId) : null;
  if (!client || client.status !== "active") {
    redirect(`/portal/login?next=${encodeURIComponent(nextPath)}`);
  }

  return client;
}
