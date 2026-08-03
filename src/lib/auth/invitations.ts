import "server-only";

import { getDb } from "../db";
import { ClientUser } from "../models/ClientUser";
import { PortalInvitation } from "../models/PortalInvitation";
import { Consultation } from "../models/Consultation";
import { generateToken, hashToken, normalizeEmail } from "./crypto";
import { sendActivationEmail } from "./email";

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

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
    if (existingClient) {
      // Never relink a consultation already linked to a different client —
      // only ever set clientUser when it is currently unset.
      await Consultation.updateOne(
        { _id: params.consultationId, clientUser: null },
        { $set: { clientUser: existingClient._id } },
      );
      return "linked_existing_client";
    }

    // At most one active (unused, unrevoked, unexpired) invitation per
    // email+purpose at a time — revoke any existing one before issuing a
    // fresh token, so repeat submitters never accumulate unlimited pending
    // invitations, and the newest email link is always the valid one.
    const now = new Date();
    await PortalInvitation.updateMany(
      {
        normalizedEmail,
        purpose: "consultation_activation",
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { revokedAt: now } },
    );

    const { firstName, lastName } = splitName(params.name);
    const token = generateToken();
    await PortalInvitation.create({
      normalizedEmail,
      firstName,
      lastName,
      consultation: params.consultationId,
      tokenHash: hashToken(token),
      purpose: "consultation_activation",
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      createdByType: "system",
    });

    // Independent of persistence succeeding above — an email failure must
    // not surface as a consultation-submission failure.
    await sendActivationEmail({
      email: params.email,
      firstName: firstName || "there",
      token,
    });

    return "invitation_issued";
  } catch (err) {
    console.error("[portal] Failed to link/invite after consultation:", err);
    return "skipped_no_db";
  }
}
