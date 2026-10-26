import "server-only";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { PortalInvitation } from "../models/PortalInvitation";
import { Consultation } from "../models/Consultation";
import { generateToken, hashToken, normalizeEmail } from "./crypto";
import { sendActivationEmail } from "./email";
import { createInitialConsultationInteraction } from "./interactions";
import { isUnverifiedAccount } from "./account-state";

/**
 * Exported so the cross-app contract test can assert the admin app's
 * mirrored copy (server/utils/clientAccountConstants.js) hasn't drifted —
 * an invitation issued by one app is consumed by the other (ADR-007 §2).
 */
export const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type OnboardingOutcome =
  | "linked_existing_client"
  | "invitation_issued"
  | "skipped_no_db";

/**
 * Best-effort split of the consultation form's single free-text "name"
 * field. Not reliable for every name format, which is why ClientUser and
 * PortalInvitation keep these fields optional rather than required.
 */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = trimmed.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

/**
 * At most one active (unused, unrevoked, unexpired) invitation per email+purpose
 * at a time: any existing one is revoked before a fresh token is issued, so a
 * repeat submitter never accumulates redeemable links and the newest email link
 * is always the valid one. The email send is independent of persistence: a
 * failed send never surfaces as a failed submission.
 */
async function issueActivationInvitation(params: {
  email: string;
  normalizedEmail: string;
  firstName: string;
  lastName: string;
  consultationId: string | null;
}): Promise<void> {
  const now = new Date();
  await PortalInvitation.updateMany(
    {
      normalizedEmail: params.normalizedEmail,
      purpose: "consultation_activation",
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } },
  );

  const token = generateToken();
  await PortalInvitation.create({
    normalizedEmail: params.normalizedEmail,
    firstName: params.firstName,
    lastName: params.lastName,
    consultation: params.consultationId,
    tokenHash: hashToken(token),
    purpose: "consultation_activation",
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    createdByType: "system",
  });

  await sendActivationEmail({
    email: params.email,
    firstName: params.firstName || "there",
    token,
  });
}

/** Minimum gap between activation emails to one address, so the resend button cannot be used to mail-bomb a mailbox. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type ResendOutcome = "sent" | "too_soon" | "unavailable";

/**
 * Sends a fresh activation link to the address of an unverified account, for the
 * resend button on the welcome screen. It can only ever email that account's own
 * address, and no more often than once per cooldown. Never throws.
 */
export async function resendActivationInvitation(account: { email: string; firstName: string }): Promise<ResendOutcome> {
  const db = getDb();
  if (!db) return "unavailable";

  try {
    await db;
    const normalizedEmail = normalizeEmail(account.email);
    const latest = await PortalInvitation.findOne({ normalizedEmail, purpose: "consultation_activation" }).sort({ createdAt: -1 });
    if (latest && !latest.usedAt && !latest.revokedAt && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return "too_soon";
    }

    await issueActivationInvitation({
      email: account.email,
      normalizedEmail,
      firstName: account.firstName,
      lastName: latest?.lastName ?? "",
      // Keep the link to the original consultation so activation still attaches it to the account.
      consultationId: latest?.consultation ? String(latest.consultation) : null,
    });
    return "sent";
  } catch (err) {
    console.error("[portal] Failed to resend the activation email:", err);
    return "unavailable";
  }
}

/**
 * Called after a consultation is persisted (src/lib/leads.ts). Links the
 * submission to an existing client account by normalized email, or issues a
 * single fresh activation invitation and emails it. Never throws — a
 * failure here must never roll back or fail the consultation submission
 * itself (module 02: "Invitation email failure must not roll back the
 * consultation").
 */
export async function linkOrInviteAfterConsultation(params: {
  email: string;
  name: string;
  consultationId: string;
}): Promise<OnboardingOutcome> {
  const db = getDb();
  if (!db) return "skipped_no_db";

  try {
    await db;
    const normalizedEmail = normalizeEmail(params.email);

    const existingClient = await ClientUser.findOne({ normalizedEmail });
    // An account that never verified its email (created by an earlier submission, or by staff
    // converting a lead) is NOT a client to link to: there is nothing to sign in to. It gets a
    // fresh activation link instead, so a visitor who lost the first email is never stranded.
    if (existingClient && !isUnverifiedAccount(existingClient)) {
      // Never relink a consultation already linked to a different client —
      // only ever set clientUser when it is currently unset.
      await Consultation.updateOne(
        { _id: params.consultationId, clientUser: null },
        { $set: { clientUser: existingClient._id } },
      );

      // Cycle 3: track this as an initial_consultation interaction now that
      // a client account is already resolvable. createInitialConsultationInteraction()
      // never throws (failures are caught and logged internally), so this
      // can never turn a successful onboarding link into a reported error.
      await createInitialConsultationInteraction({
        consultationId: params.consultationId,
        clientUserId: String(existingClient._id),
      });

      return "linked_existing_client";
    }

    const { firstName, lastName } = splitName(params.name);
    await issueActivationInvitation({
      email: params.email,
      normalizedEmail,
      firstName,
      lastName,
      consultationId: params.consultationId,
    });

    return "invitation_issued";
  } catch (err) {
    console.error("[portal] Failed to link/invite after consultation:", err);
    return "skipped_no_db";
  }
}
