import "server-only";

import { getDb } from "../../../../lib/db";
import { ClientUser } from "../../../../lib/models/ClientUser";
import { PortalInvitation } from "../../../../lib/models/PortalInvitation";
import { Consultation } from "../../../../lib/models/Consultation";
import { activateInvitedMembershipsForClient } from "../../../../lib/auth/case-membership";
import { createInitialConsultationInteraction } from "../../../../lib/auth/interactions";
import { hashToken, hashPassword } from "../../../../lib/auth/crypto";
import { createSession, serializeSessionCookie } from "../../../../lib/auth/session";
import { verifyOrigin } from "../../../../lib/auth/csrf";
import { isRateLimited } from "../../../../lib/rate-limit";
import { isValidPassword } from "../../../../lib/auth/validation";
import { jsonError, jsonOk } from "../../../../lib/auth/http";

/**
 * Redeems a PortalInvitation: creates the ClientUser, marks the invitation
 * used, links the originating consultation, and starts a fresh session
 * (session rotation — there is no pre-activation session to reuse, so this
 * is the first session id the client ever sees).
 */
export async function POST(request: Request): Promise<Response> {
  if (!verifyOrigin(request)) return jsonError("forbidden", "Request rejected.");
  if (await isRateLimited("portal-activate", request)) {
    return jsonError("rate_limited", "Too many attempts. Please try again later.");
  }

  let body: { token?: unknown; password?: unknown; confirmPassword?: unknown; acceptedTerms?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_input", "Invalid request body.");
  }

  const { token, password, confirmPassword, acceptedTerms } = body;
  if (typeof token !== "string" || !token) {
    return jsonError("invalid_input", "Missing activation token.");
  }
  if (!isValidPassword(password)) {
    return jsonError(
      "unprocessable",
      "Password must be at least 10 characters long.",
    );
  }
  if (password !== confirmPassword) {
    return jsonError("unprocessable", "Passwords do not match.");
  }

  const db = getDb();
  if (!db) return jsonError("server_error", "Service temporarily unavailable.");
  await db;

  const tokenHash = hashToken(token);
  const invitation = await PortalInvitation.findOneAndUpdate(
    { tokenHash },
    { $inc: { attemptCount: 1 } },
  );

  const genericInvalid = () =>
    jsonError(
      "unauthenticated",
      "This activation link is invalid or has expired. Please request a new one.",
    );

  if (!invitation) return genericInvalid();
  if (invitation.revokedAt) return genericInvalid();
  if (invitation.expiresAt.getTime() <= Date.now()) return genericInvalid();
  if (invitation.usedAt) {
    return jsonError(
      "conflict",
      "This activation link has already been used. Please log in instead.",
    );
  }

  const existingClient = await ClientUser.findOne({
    normalizedEmail: invitation.normalizedEmail,
  });
  if (existingClient) {
    return jsonError(
      "conflict",
      "An account already exists for this email. Please log in instead.",
    );
  }

  const now = new Date();
  const passwordHash = await hashPassword(password);
  const client = await ClientUser.create({
    email: invitation.normalizedEmail,
    normalizedEmail: invitation.normalizedEmail,
    passwordHash,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    status: "active",
    emailVerifiedAt: now,
    acceptedTermsAt: acceptedTerms ? now : null,
    passwordChangedAt: now,
  });

  invitation.usedAt = now;
  invitation.clientUser = client._id;
  await invitation.save();

  if (invitation.consultation) {
    await Consultation.updateOne(
      { _id: invitation.consultation, clientUser: null },
      { $set: { clientUser: client._id } },
    );

    // Cycle 3: the initial_consultation interaction was deferred at
    // submission time because no client account existed yet (module doc
    // §14: "the interaction remains valid and is linked when the client
    // relationship becomes available") — create it now.
    await createInitialConsultationInteraction({
      consultationId: String(invitation.consultation),
      clientUserId: String(client._id),
    });
  }

  // One narrow, documented exception to this app being read-only against
  // Case/Workspace/Membership collections (ADR-002 §1): a manager may have
  // already converted this client's consultation into a case while the
  // client's account was still 'pending', creating an 'invited' membership
  // (see server/services/caseConversion.js). The module doc requires that
  // membership become active the moment the account itself does.
  await activateInvitedMembershipsForClient(String(client._id));

  const sessionToken = await createSession(String(client._id), {
    ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "",
    userAgent: request.headers.get("user-agent") || "",
  });

  return jsonOk(
    { redirectTo: "/portal" },
    { headers: { "Set-Cookie": serializeSessionCookie(sessionToken) } },
  );
}
