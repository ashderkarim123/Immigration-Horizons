import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { ClientSession } from "../models/ClientSession";
import { hashPassword, verifyPassword } from "./crypto";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "./validation";

/**
 * Client self-service account operations (ADR-011 §4).
 *
 * Everything here is scoped by the caller's own `clientUserId`, taken from
 * the verified session — never from request input. There is no "which
 * client?" parameter to get wrong: a client can only ever act on
 * themselves, which is what makes these routes safe without a membership
 * check (they are not case-scoped resources).
 *
 * The one exception that *is* row-level scoped is session revocation: a
 * session id arrives from the page, so every lookup filters on
 * `{ _id, clientUser }` together. A session id belonging to another
 * account is indistinguishable from one that does not exist.
 */

export const MAX_NAME_LENGTH = 80;
export const MAX_PHONE_LENGTH = 40;

/**
 * Permissive on purpose. Clients are international, and a strict pattern
 * rejects legitimate numbers far more often than it catches a bad one —
 * this bounds length and character class, nothing more.
 */
const PHONE_PATTERN = /^[0-9+()\-.\s]*$/;

export type AccountResult<T = undefined> =
  | { outcome: "updated"; value: T }
  | { outcome: "unchanged" }
  | { outcome: "not_found" }
  | { outcome: "validation_error"; field: string; message: string };

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export type ProfileInput = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
};

/**
 * Updates the client's own display details.
 *
 * **Email is deliberately not updatable here.** It is the login identity,
 * the key every invitation is issued against, and the address every
 * notification is delivered to — changing it safely needs a verify-new,
 * keep-old-until-confirmed flow that does not exist yet. The UI says so
 * rather than offering a disabled field with no explanation.
 */
export async function updateClientProfile(
  clientUserId: string,
  input: ProfileInput,
): Promise<AccountResult<{ firstName: string; lastName: string; phone: string }>> {
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";

  if (!firstName) {
    return { outcome: "validation_error", field: "firstName", message: "Enter your first name." };
  }
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return {
      outcome: "validation_error",
      field: "firstName",
      message: `Names must be ${MAX_NAME_LENGTH} characters or fewer.`,
    };
  }
  if (phone.length > MAX_PHONE_LENGTH) {
    return {
      outcome: "validation_error",
      field: "phone",
      message: `Phone numbers must be ${MAX_PHONE_LENGTH} characters or fewer.`,
    };
  }
  if (phone && !PHONE_PATTERN.test(phone)) {
    return {
      outcome: "validation_error",
      field: "phone",
      message: "Use digits, spaces, and + ( ) - only.",
    };
  }

  const db = getDb();
  if (!db) return { outcome: "not_found" };
  await db;

  const client = await ClientUser.findById(clientUserId).select("firstName lastName phone");
  if (!client) return { outcome: "not_found" };

  if (client.firstName === firstName && client.lastName === lastName && client.phone === phone) {
    return { outcome: "unchanged" };
  }

  client.firstName = firstName;
  client.lastName = lastName;
  client.phone = phone;
  await client.save();

  return { outcome: "updated", value: { firstName, lastName, phone } };
}

/**
 * Changes the password for a signed-in client.
 *
 * Requires the current password: a session left open on a shared machine
 * must not be enough to lock the real owner out of their own account.
 *
 * On success every **other** session is revoked, and the current one is
 * kept. This differs deliberately from the reset flow, which revokes
 * everything: a reset is the moment compromise is suspected and the user
 * is not present, whereas here the user is present and signing them out of
 * the tab they are looking at is hostile without being safer.
 */
export async function changeClientPassword(params: {
  clientUserId: string;
  currentSessionId: string;
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
}): Promise<AccountResult<{ revokedSessions: number }>> {
  const { clientUserId, currentSessionId, currentPassword, newPassword, confirmPassword } = params;

  if (typeof currentPassword !== "string" || !currentPassword) {
    return {
      outcome: "validation_error",
      field: "currentPassword",
      message: "Enter your current password.",
    };
  }
  if (!isValidPassword(newPassword)) {
    return {
      outcome: "validation_error",
      field: "newPassword",
      message: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    };
  }
  if (newPassword !== confirmPassword) {
    return {
      outcome: "validation_error",
      field: "confirmPassword",
      message: "Those passwords do not match.",
    };
  }

  const db = getDb();
  if (!db) return { outcome: "not_found" };
  await db;

  const client = await ClientUser.findById(clientUserId).select("passwordHash passwordChangedAt");
  if (!client) return { outcome: "not_found" };

  if (!(await verifyPassword(currentPassword, client.passwordHash))) {
    return {
      outcome: "validation_error",
      field: "currentPassword",
      message: "That is not your current password.",
    };
  }

  if (await verifyPassword(String(newPassword), client.passwordHash)) {
    return {
      outcome: "validation_error",
      field: "newPassword",
      message: "Choose a password you have not used here before.",
    };
  }

  client.passwordHash = await hashPassword(String(newPassword));
  client.passwordChangedAt = new Date();
  await client.save();

  const revoked = await ClientSession.deleteMany({
    clientUser: clientUserId,
    _id: { $ne: currentSessionId },
  });

  return { outcome: "updated", value: { revokedSessions: revoked.deletedCount ?? 0 } };
}

export type ClientSessionRow = {
  id: string;
  isCurrent: boolean;
  createdIp: string;
  /** Coarse, human-readable device description — never the raw UA string. */
  device: string;
  lastSeenAt: Date | null;
  createdAt: Date | null;
  expiresAt: Date | null;
};

/**
 * Summarises a user-agent into something a person can recognise.
 *
 * The raw string is deliberately never rendered: it is long, meaningless
 * to most people, and fingerprint-adjacent. "Chrome on Windows" answers
 * the only question this list exists to answer — do I recognise this?
 */
export function describeUserAgent(userAgent: string): string {
  const ua = userAgent || "";
  if (!ua) return "Unknown device";

  const browser =
    /\bEdg\//.test(ua) ? "Edge"
    : /\bOPR\/|\bOpera\b/.test(ua) ? "Opera"
    : /\bChrome\//.test(ua) ? "Chrome"
    : /\bFirefox\//.test(ua) ? "Firefox"
    : /\bSafari\//.test(ua) ? "Safari"
    : "Browser";

  const platform =
    /\biPhone\b/.test(ua) ? "iPhone"
    : /\biPad\b/.test(ua) ? "iPad"
    : /\bAndroid\b/.test(ua) ? "Android"
    : /\bWindows\b/.test(ua) ? "Windows"
    : /\bMac OS X\b|\bMacintosh\b/.test(ua) ? "Mac"
    : /\bLinux\b/.test(ua) ? "Linux"
    : "";

  return platform ? `${browser} on ${platform}` : browser;
}

/** Every live session for this client, newest activity first. */
export async function listClientSessions(
  clientUserId: string,
  currentSessionId: string,
): Promise<ClientSessionRow[]> {
  const db = getDb();
  if (!db) return [];
  await db;

  const now = new Date();
  const sessions = await ClientSession.find({
    clientUser: clientUserId,
    expiresAt: { $gt: now },
    idleExpiresAt: { $gt: now },
  })
    .select("createdIp userAgent lastSeenAt createdAt expiresAt")
    .sort({ lastSeenAt: -1 })
    .limit(25)
    .lean();

  return (sessions as Record<string, unknown>[]).map((session) => ({
    id: String(session._id),
    isCurrent: String(session._id) === currentSessionId,
    createdIp: String(session.createdIp || ""),
    device: describeUserAgent(String(session.userAgent || "")),
    lastSeenAt: (session.lastSeenAt as Date | null) ?? null,
    createdAt: (session.createdAt as Date | null) ?? null,
    expiresAt: (session.expiresAt as Date | null) ?? null,
  }));
}

/**
 * Revokes one of the client's own sessions.
 *
 * Scoped on `{ _id, clientUser }` together, so another account's session
 * id produces exactly the same `not_found` as a nonexistent one.
 */
export async function revokeClientSession(params: {
  clientUserId: string;
  currentSessionId: string;
  sessionId: string;
}): Promise<AccountResult<{ wasCurrent: boolean }>> {
  const { clientUserId, currentSessionId, sessionId } = params;

  if (!mongoose.Types.ObjectId.isValid(sessionId)) return { outcome: "not_found" };

  const db = getDb();
  if (!db) return { outcome: "not_found" };
  await db;

  const result = await ClientSession.deleteOne({ _id: sessionId, clientUser: clientUserId });
  if (result.deletedCount === 0) return { outcome: "not_found" };

  return { outcome: "updated", value: { wasCurrent: sessionId === currentSessionId } };
}

/** Signs out every device except the one making the request. */
export async function revokeOtherClientSessions(params: {
  clientUserId: string;
  currentSessionId: string;
}): Promise<{ revokedSessions: number }> {
  const db = getDb();
  if (!db) return { revokedSessions: 0 };
  await db;

  const result = await ClientSession.deleteMany({
    clientUser: params.clientUserId,
    _id: { $ne: params.currentSessionId },
  });

  return { revokedSessions: result.deletedCount ?? 0 };
}
