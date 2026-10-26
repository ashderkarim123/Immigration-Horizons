import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.test";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, nextTestIp, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientSession } from "../src/lib/models/ClientSession";
import { PortalInvitation } from "../src/lib/models/PortalInvitation";
import { Consultation } from "../src/lib/models/Consultation";
import { generateToken, hashPassword, hashToken } from "../src/lib/auth/crypto";
import { createSession, getSessionActor, getUnverifiedSession, lookupUnverifiedSessionByToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { createUnverifiedPortalAccount } from "../src/lib/auth/unverified-signup";
import { linkOrInviteAfterConsultation, RESEND_COOLDOWN_MS } from "../src/lib/auth/invitations";
import { isUnverifiedAccount } from "../src/lib/auth/account-state";
import { POST as activatePOST } from "../src/app/api/portal/activate/route";
import { POST as resendPOST } from "../src/app/api/portal/resend-activation/route";
import { POST as welcomePOST } from "../src/app/(app)/portal/welcome/route";
import * as calendarRoute from "../src/app/api/portal/cases/[caseId]/calendar/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";
const asRequest = (cookie: string) => new Request(`${TEST_ORIGIN}/portal`, { headers: { cookie } });
const sessionCookie = (token: string) => cookieHeader(SESSION_COOKIE_NAME, token);

async function makeConsultation(email: string) {
  return String((await Consultation.create({ name: "Ada Lovelace", email, service: "EB-2 NIW", message: "Test message long enough to pass validation." }))._id);
}

/** A brand-new visitor: submits the form, receives an invitation, and is signed in to an unverified account. */
async function signUp(email = "new.visitor@example.com") {
  const consultationId = await makeConsultation(email);
  const outcome = await linkOrInviteAfterConsultation({ email, name: "Ada Lovelace", consultationId });
  const signup = await createUnverifiedPortalAccount({ email, name: "Ada Lovelace" });
  return { email, outcome, signup };
}

async function activeClient(email: string) {
  return ClientUser.create({ email, normalizedEmail: email, passwordHash: await hashPassword(PASSWORD), firstName: "Real", status: "active", emailVerifiedAt: new Date() });
}

// ---------------------------------------------------------------------------
// Who may be signed in
// ---------------------------------------------------------------------------

test("a brand-new email gets an unverified account: pending, no password, not verified, and a session", async () => {
  const { email, outcome, signup } = await signUp();
  assert.equal(outcome, "invitation_issued");
  assert.ok(signup, "a session is issued for the new account");

  const client = await ClientUser.findOne({ normalizedEmail: email });
  assert.equal(client!.status, "pending");
  assert.equal(client!.passwordHash, "");
  assert.equal(client!.emailVerifiedAt, null);
  assert.equal(client!.firstName, "Ada");
  assert.ok(isUnverifiedAccount(client!));
  assert.equal(await ClientSession.countDocuments({ clientUser: client!._id }), 1);
});

test("an EXISTING account is never signed in by the form, whatever its status: anyone can type anyone's email", async () => {
  const email = "real.client@example.com";
  const real = await activeClient(email);
  await signUp(email); // an attacker types the real client's email into the public form

  assert.equal(await createUnverifiedPortalAccount({ email, name: "Attacker" }), null);
  assert.equal(await ClientSession.countDocuments({ clientUser: real._id }), 0, "no session was created for the real account");
  assert.equal(await ClientUser.countDocuments({ normalizedEmail: email }), 1, "no second account was created either");

  // Also not for the case that looks most "claimable": an account staff created, still pending, with no password.
  const staffEmail = "staff.created@example.com";
  await ClientUser.create({ email: staffEmail, normalizedEmail: staffEmail, status: "pending" });
  assert.equal(await createUnverifiedPortalAccount({ email: staffEmail, name: "Attacker" }), null);
  assert.equal(await ClientSession.countDocuments({}), 0);
});

test("an unverified session is rejected by every normal guard: it can reach nothing that is not explicitly opted in", async () => {
  const { signup } = await signUp();
  const cookie = sessionCookie(signup!.sessionToken);

  assert.equal(await getSessionActor(asRequest(cookie)), null, "the guard every portal page and API uses refuses it");
  const res = await calendarRoute.GET(new Request(`${TEST_ORIGIN}/api/portal/cases/64b0f0f0f0f0f0f0f0f0f0f0/calendar`, { headers: { cookie } }), {
    params: Promise.resolve({ caseId: "64b0f0f0f0f0f0f0f0f0f0f0" }),
  });
  assert.equal(res.status, 401, "a protected portal API answers an unverified session exactly as it answers no session");

  const actor = await getUnverifiedSession(asRequest(cookie));
  assert.ok(actor, "only the explicit unverified lookup accepts it");
  assert.equal(actor!.email, "new.visitor@example.com");
});

test("an active account's session is not an 'unverified session', so the opt-in doors cannot be used by a real client", async () => {
  const real = await activeClient("real.client@example.com");
  const token = await createSession(String(real._id));
  assert.equal(await lookupUnverifiedSessionByToken(token), null);
});

// ---------------------------------------------------------------------------
// Verifying the account
// ---------------------------------------------------------------------------

test("PRE-HIJACKING: verifying the account destroys the session the form-submitter held", async () => {
  // An attacker signs up with the victim's address and keeps the session...
  const email = "victim@example.com";
  const { signup } = await signUp(email);
  const attackerToken = signup!.sessionToken;
  assert.ok(await getUnverifiedSession(asRequest(sessionCookie(attackerToken))));

  // ...the victim, who owns the mailbox, opens the emailed link and chooses a password.
  const victimToken = generateToken();
  await PortalInvitation.updateMany({ normalizedEmail: email }, { $set: { revokedAt: new Date() } });
  await PortalInvitation.create({ normalizedEmail: email, firstName: "Victim", tokenHash: hashToken(victimToken), purpose: "consultation_activation", expiresAt: new Date(Date.now() + 3_600_000) });
  const res = await activatePOST(jsonRequest("/api/portal/activate", { token: victimToken, password: PASSWORD, confirmPassword: PASSWORD, acceptedTerms: true }));
  assert.equal(res.status, 200);

  // The account is now verified and active, and the attacker's session is gone from every guard.
  const client = await ClientUser.findOne({ normalizedEmail: email });
  assert.equal(client!.status, "active");
  assert.ok(client!.emailVerifiedAt);
  assert.ok(client!.passwordHash);
  assert.equal(await ClientSession.countDocuments({ tokenHash: hashToken(attackerToken) }), 0, "the attacker's session row was deleted");
  assert.equal(await getSessionActor(asRequest(sessionCookie(attackerToken))), null, "and it no longer opens the now-verified account");
  assert.equal(await ClientUser.countDocuments({ normalizedEmail: email }), 1, "the unverified account was adopted, not duplicated");

  // The victim's own fresh session works.
  const victimSession = extractCookie(res, SESSION_COOKIE_NAME);
  assert.ok(victimSession);
  assert.ok(await getSessionActor(asRequest(sessionCookie(victimSession!))));
});

test("an account that already has a password is still refused at activation: only unverified accounts are adopted", async () => {
  const email = "already.active@example.com";
  await activeClient(email);
  const token = generateToken();
  await PortalInvitation.create({ normalizedEmail: email, tokenHash: hashToken(token), purpose: "consultation_activation", expiresAt: new Date(Date.now() + 3_600_000) });

  const res = await activatePOST(jsonRequest("/api/portal/activate", { token, password: PASSWORD, confirmPassword: PASSWORD }));
  assert.equal(res.status, 409);
  assert.equal(await ClientSession.countDocuments({}), 0);
});

test("a second form submission from an unverified email re-issues an activation link instead of stranding the visitor", async () => {
  const { email } = await signUp();
  const second = await makeConsultation(email);
  const outcome = await linkOrInviteAfterConsultation({ email, name: "Ada Lovelace", consultationId: second });

  assert.equal(outcome, "invitation_issued", "an unverified account is not a client to link to");
  assert.equal(await PortalInvitation.countDocuments({ normalizedEmail: email, revokedAt: null, usedAt: null }), 1, "exactly one redeemable link");
  assert.equal(await ClientUser.countDocuments({ normalizedEmail: email }), 1, "and still one account");
  assert.equal(await createUnverifiedPortalAccount({ email, name: "Ada" }), null, "the repeat submission gets no second session");
});

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

test("resend: needs an unverified session, emails only that account, and is rate-limited per address", async () => {
  const { email, signup } = await signUp();
  const cookie = sessionCookie(signup!.sessionToken);

  assert.equal((await resendPOST(jsonRequest("/api/portal/resend-activation", {}))).status, 401, "no session");
  assert.equal((await resendPOST(jsonRequest("/api/portal/resend-activation", {}, { cookie, origin: "https://evil.example" }))).status, 403, "wrong origin");

  // The invitation from sign-up is brand new, so an immediate resend is refused.
  const tooSoon = await resendPOST(jsonRequest("/api/portal/resend-activation", {}, { cookie }));
  assert.equal(tooSoon.status, 429);
  assert.equal(await PortalInvitation.countDocuments({ normalizedEmail: email, revokedAt: null, usedAt: null }), 1);

  // Once the cooldown has passed, exactly one fresh link replaces the old one.
  // Raw collection: Mongoose treats createdAt as immutable, so a model update would silently ignore this.
  await PortalInvitation.collection.updateMany({ normalizedEmail: email }, { $set: { createdAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 1000) } });
  const ok = await resendPOST(jsonRequest("/api/portal/resend-activation", {}, { cookie }));
  assert.equal(ok.status, 200);
  const live = await PortalInvitation.find({ normalizedEmail: email, revokedAt: null, usedAt: null });
  assert.equal(live.length, 1, "the old link was revoked");
  assert.ok(live[0].consultation, "the new link still carries the original consultation");
});

test("resend is closed to a verified client's session", async () => {
  const real = await activeClient("real.client@example.com");
  const token = await createSession(String(real._id));
  const res = await resendPOST(jsonRequest("/api/portal/resend-activation", {}, { cookie: sessionCookie(token) }));
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// The hand-off from the public site
// ---------------------------------------------------------------------------

function welcome(token: string | null, origin: string | null = TEST_ORIGIN) {
  const form = new FormData();
  if (token !== null) form.set("token", token);
  const headers = new Headers({ "x-forwarded-for": nextTestIp() });
  if (origin !== null) headers.set("origin", origin);
  return welcomePOST(new Request(`${TEST_ORIGIN}/portal/welcome`, { method: "POST", headers, body: form }));
}

test("welcome hand-off: a live unverified session is moved to the portal host as a cookie, from the portal or the public origin", async () => {
  const { signup } = await signUp();
  for (const origin of [TEST_ORIGIN, "https://public.example.test"]) {
    const res = await welcome(signup!.sessionToken, origin);
    assert.equal(res.status, 303, origin);
    assert.equal(res.headers.get("location"), "/portal");
    assert.equal(extractCookie(res, SESSION_COOKIE_NAME), signup!.sessionToken);
    assert.match(res.headers.get("set-cookie") ?? "", /HttpOnly/);
  }
});

test("welcome hand-off refuses other origins, garbage, and every session that is not an unverified one", async () => {
  const { signup } = await signUp();
  assert.equal((await welcome(signup!.sessionToken, "https://evil.example")).status, 403);
  assert.equal((await welcome(signup!.sessionToken, null)).status, 403);

  for (const bad of [null, "", "not-a-real-token"]) {
    const res = await welcome(bad);
    assert.equal(res.headers.get("location"), "/portal/login");
    assert.equal(res.headers.get("set-cookie"), null, "no cookie for a refused token");
  }

  // A VERIFIED client's session must not be movable through this door.
  const real = await activeClient("real.client@example.com");
  const realToken = await createSession(String(real._id));
  const res = await welcome(realToken);
  assert.equal(res.headers.get("location"), "/portal/login");
  assert.equal(res.headers.get("set-cookie"), null);
});
