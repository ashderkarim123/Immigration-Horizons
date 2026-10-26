import "server-only";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { normalizeEmail } from "./crypto";
import { createSession } from "./session";
import { splitName } from "./invitations";

/**
 * Cookie that carries the new session from the form's action to the thank-you
 * page on the marketing host (ADR-033 §3). Scoped to that one path and short-lived.
 */
export const HANDOFF_COOKIE = "ih_portal_handoff";
export const HANDOFF_COOKIE_PATH = "/consultation";
export const HANDOFF_MAX_AGE_SECONDS = 60 * 10;

export type UnverifiedSignup = { clientUserId: string; sessionToken: string };

/**
 * Creates the unverified account for a form submission and signs it in, ONLY
 * when no account exists for the email.
 *
 * The rule that makes instant access safe (ADR-033): an account that already
 * exists, whatever its status, never gets a session here. Anyone can type
 * anyone's email into a public form, so handing a session to an existing
 * account would let a stranger sign in as an existing client. Returns null in
 * that case, and on any failure: signing in is a convenience, never a reason to
 * fail a submission that was already accepted.
 */
export async function createUnverifiedPortalAccount(params: {
  email: string;
  name: string;
  meta?: { ip?: string; userAgent?: string };
}): Promise<UnverifiedSignup | null> {
  const db = getDb();
  if (!db) return null;

  try {
    await db;
    const normalizedEmail = normalizeEmail(params.email);
    if (await ClientUser.exists({ normalizedEmail })) return null;

    const { firstName, lastName } = splitName(params.name);
    const client = await ClientUser.create({
      email: normalizedEmail,
      normalizedEmail,
      firstName,
      lastName,
      status: "pending",
      passwordHash: "",
      emailVerifiedAt: null,
    });

    const sessionToken = await createSession(String(client._id), params.meta);
    return { clientUserId: String(client._id), sessionToken };
  } catch (err) {
    // Includes the duplicate-key error when two submissions for the same new email race.
    console.error("[portal] Could not create an unverified account:", err);
    return null;
  }
}
