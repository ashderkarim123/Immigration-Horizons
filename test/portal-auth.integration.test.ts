import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, nextTestIp, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientSession } from "../src/lib/models/ClientSession";
import { PortalInvitation } from "../src/lib/models/PortalInvitation";
import { PasswordResetToken } from "../src/lib/models/PasswordResetToken";
import { Consultation } from "../src/lib/models/Consultation";

import { generateToken, hashToken, hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME, getSessionActor } from "../src/lib/auth/session";

import { POST as activatePOST } from "../src/app/api/portal/activate/route";
import { POST as loginPOST } from "../src/app/api/portal/login/route";
import { POST as logoutPOST } from "../src/app/api/portal/logout/route";
import { POST as forgotPasswordPOST } from "../src/app/api/portal/forgot-password/route";
import { POST as resetPasswordPOST } from "../src/app/api/portal/reset-password/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const STRONG_PASSWORD = "correct-horse-battery-staple";

async function createInvitation(overrides: Partial<{
  normalizedEmail: string;
  expiresInMs: number;
  usedAt: Date | null;
  revokedAt: Date | null;
}> = {}) {
  const token = generateToken();
  const normalizedEmail = overrides.normalizedEmail ?? "activate-me@example.com";
  await PortalInvitation.create({
    normalizedEmail,
    firstName: "Ada",
    lastName: "Lovelace",
    tokenHash: hashToken(token),
    purpose: "consultation_activation",
    expiresAt: new Date(Date.now() + (overrides.expiresInMs ?? 1000 * 60 * 60)),
    usedAt: overrides.usedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
  });
  return { token, normalizedEmail };
}

async function createActiveClient(overrides: Partial<{
  email: string;
  password: string;
  status: string;
}> = {}) {
  const email = overrides.email ?? "client@example.com";
  const password = overrides.password ?? STRONG_PASSWORD;
  const client = await ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: await hashPassword(password),
    firstName: "Ada",
    lastName: "Lovelace",
    status: overrides.status ?? "active",
    emailVerifiedAt: new Date(),
  });
  return { client, email, password };
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

test("activation: valid token creates an active ClientUser and a rotated session cookie", async () => {
  const { token, normalizedEmail } = await createInvitation();

  const res = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
      acceptedTerms: true,
    }),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.redirectTo, "/portal");

  const cookie = extractCookie(res, SESSION_COOKIE_NAME);
  assert.ok(cookie, "Set-Cookie must include a session token");

  const client = await ClientUser.findOne({ normalizedEmail });
  assert.ok(client);
  assert.equal(client!.status, "active");
  assert.ok(client!.emailVerifiedAt);

  assert.equal(await ClientSession.countDocuments({ clientUser: client!._id }), 1);
});

test("activation: password mismatch is rejected as 422 and creates no account", async () => {
  const { token, normalizedEmail } = await createInvitation();

  const res = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token,
      password: STRONG_PASSWORD,
      confirmPassword: "different-password-here",
    }),
  );

  assert.equal(res.status, 422);
  assert.equal(await ClientUser.countDocuments({ normalizedEmail }), 0);
});

test("activation: too-short password is rejected as 422", async () => {
  const { token } = await createInvitation();
  const res = await activatePOST(
    jsonRequest("/api/portal/activate", { token, password: "short", confirmPassword: "short" }),
  );
  assert.equal(res.status, 422);
});

test("activation: expired token is rejected", async () => {
  const { token, normalizedEmail } = await createInvitation({ expiresInMs: -1000 });

  const res = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    }),
  );

  assert.equal(res.status, 401);
  assert.equal(await ClientUser.countDocuments({ normalizedEmail }), 0);
});

test("activation: revoked token is rejected", async () => {
  const { token, normalizedEmail } = await createInvitation({ revokedAt: new Date() });

  const res = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    }),
  );

  assert.equal(res.status, 401);
  assert.equal(await ClientUser.countDocuments({ normalizedEmail }), 0);
});

test("activation: a used (already-redeemed) token is rejected on a second attempt", async () => {
  const { token } = await createInvitation();

  const first = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    }),
  );
  assert.equal(first.status, 200);

  const second = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    }),
  );
  assert.equal(second.status, 409);
});

test("activation: unknown token is rejected without leaking whether it ever existed", async () => {
  const res = await activatePOST(
    jsonRequest("/api/portal/activate", {
      token: generateToken(),
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    }),
  );
  assert.equal(res.status, 401);
});

test("activation: CSRF — request with a mismatched Origin is rejected", async () => {
  const { token } = await createInvitation();
  const res = await activatePOST(
    jsonRequest(
      "/api/portal/activate",
      { token, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD },
      { origin: "https://evil.example.com" },
    ),
  );
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test("login: correct credentials succeed and set a session cookie", async () => {
  const { email, password } = await createActiveClient();

  const res = await loginPOST(jsonRequest("/api/portal/login", { email, password }));
  assert.equal(res.status, 200);
  assert.ok(extractCookie(res, SESSION_COOKIE_NAME));
});

test("login: wrong password and unknown email return the identical generic error", async () => {
  const { email } = await createActiveClient();

  const wrongPassword = await loginPOST(
    jsonRequest("/api/portal/login", { email, password: "totally-wrong-password" }),
  );
  const unknownEmail = await loginPOST(
    jsonRequest("/api/portal/login", { email: "nobody@example.com", password: "whatever12345" }),
  );

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  const [a, b] = await Promise.all([wrongPassword.json(), unknownEmail.json()]);
  assert.equal(a.error.message, b.error.message, "no account enumeration via message differences");
});

test("login: disabled account is blocked with the same generic error", async () => {
  const { email, password } = await createActiveClient({ status: "disabled" });
  const res = await loginPOST(jsonRequest("/api/portal/login", { email, password }));
  assert.equal(res.status, 401);
});

test("login: pending (never-activated) account is blocked", async () => {
  const { email, password } = await createActiveClient({ status: "pending" });
  const res = await loginPOST(jsonRequest("/api/portal/login", { email, password }));
  assert.equal(res.status, 401);
});

test("login: repeated failures lock the account, and a subsequently-correct password is still rejected while locked", async () => {
  const { email, password } = await createActiveClient();
  const ip = nextTestIp();

  // Rate limiter allows 5/min per IP — stay at 5 failed attempts exactly so
  // this test exercises account lockout, not the separate IP rate limiter.
  for (let i = 0; i < 5; i += 1) {
    const res = await loginPOST(
      jsonRequest("/api/portal/login", { email, password: "wrong-password-attempt" }, { ip }),
    );
    assert.equal(res.status, 401);
  }

  const client = await ClientUser.findOne({ normalizedEmail: email });
  assert.ok(client!.lockedUntil && client!.lockedUntil.getTime() > Date.now());

  const stillLocked = await loginPOST(
    jsonRequest("/api/portal/login", { email, password }, { ip: nextTestIp() }),
  );
  assert.equal(stillLocked.status, 401, "correct password must still fail while locked");
});

test("login: CSRF — request with a mismatched Origin is rejected", async () => {
  const { email, password } = await createActiveClient();
  const res = await loginPOST(
    jsonRequest("/api/portal/login", { email, password }, { origin: "https://evil.example.com" }),
  );
  assert.equal(res.status, 403);
});

test("login: rate limiting — 6th request from the same IP within the window is rejected", async () => {
  const ip = nextTestIp();
  let last: Response | null = null;
  for (let i = 0; i < 6; i += 1) {
    last = await loginPOST(
      jsonRequest(
        "/api/portal/login",
        { email: `nobody-${i}@example.com`, password: "irrelevant12345" },
        { ip },
      ),
    );
  }
  assert.equal(last!.status, 429);
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

test("logout: invalidates the session so the old cookie no longer authenticates", async () => {
  const { email, password } = await createActiveClient();
  const loginRes = await loginPOST(jsonRequest("/api/portal/login", { email, password }));
  const sessionToken = extractCookie(loginRes, SESSION_COOKIE_NAME)!;
  const cookie = cookieHeader(SESSION_COOKIE_NAME, sessionToken);

  const authedBefore = await getSessionActor(
    new Request(TEST_ORIGIN, { headers: { cookie } }),
  );
  assert.ok(authedBefore, "session must be valid before logout");

  const logoutRes = await logoutPOST(jsonRequest("/api/portal/logout", {}, { cookie }));
  assert.equal(logoutRes.status, 200);

  const authedAfter = await getSessionActor(
    new Request(TEST_ORIGIN, { headers: { cookie } }),
  );
  assert.equal(authedAfter, null, "old session cookie must no longer authenticate");
});

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

test("forgot-password: identical generic response for an existing and a non-existent email", async () => {
  await createActiveClient({ email: "known@example.com" });

  const known = await forgotPasswordPOST(
    jsonRequest("/api/portal/forgot-password", { email: "known@example.com" }),
  );
  const unknown = await forgotPasswordPOST(
    jsonRequest("/api/portal/forgot-password", { email: "unknown@example.com" }),
  );

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  const [a, b] = await Promise.all([known.json(), unknown.json()]);
  assert.equal(a.message, b.message);
});

test("forgot-password: issues exactly one reset token for a known active account", async () => {
  const { client } = await createActiveClient({ email: "reset-me@example.com" });

  await forgotPasswordPOST(
    jsonRequest("/api/portal/forgot-password", { email: "reset-me@example.com" }),
  );

  assert.equal(await PasswordResetToken.countDocuments({ clientUser: client._id }), 1);
});

test("reset-password: valid token updates the password and invalidates every existing session", async () => {
  const { client, email, password } = await createActiveClient({ email: "reset-flow@example.com" });

  const loginRes = await loginPOST(jsonRequest("/api/portal/login", { email, password }));
  const sessionCookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(loginRes, SESSION_COOKIE_NAME)!);
  assert.equal(await ClientSession.countDocuments({ clientUser: client._id }), 1);

  const rawToken = generateToken();
  await PasswordResetToken.create({
    clientUser: client._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  });

  const newPassword = "a-brand-new-strong-password";
  const resetRes = await resetPasswordPOST(
    jsonRequest("/api/portal/reset-password", {
      token: rawToken,
      password: newPassword,
      confirmPassword: newPassword,
    }),
  );
  assert.equal(resetRes.status, 200);

  assert.equal(
    await ClientSession.countDocuments({ clientUser: client._id }),
    0,
    "every existing session must be invalidated by a password reset",
  );

  const oldSessionStillWorks = await getSessionActor(
    new Request(TEST_ORIGIN, { headers: { cookie: sessionCookie } }),
  );
  assert.equal(oldSessionStillWorks, null);

  const loginWithOldPassword = await loginPOST(
    jsonRequest("/api/portal/login", { email, password }),
  );
  assert.equal(loginWithOldPassword.status, 401);

  const loginWithNewPassword = await loginPOST(
    jsonRequest("/api/portal/login", { email, password: newPassword }),
  );
  assert.equal(loginWithNewPassword.status, 200);
});

test("reset-password: expired token is rejected", async () => {
  const { client } = await createActiveClient({ email: "expired-reset@example.com" });
  const rawToken = generateToken();
  await PasswordResetToken.create({
    clientUser: client._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() - 1000),
  });

  const res = await resetPasswordPOST(
    jsonRequest("/api/portal/reset-password", {
      token: rawToken,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    }),
  );
  assert.equal(res.status, 401);
});

test("reset-password: used token is rejected on a second attempt", async () => {
  const { client } = await createActiveClient({ email: "reused-reset@example.com" });
  const rawToken = generateToken();
  await PasswordResetToken.create({
    clientUser: client._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  });

  const body = { token: rawToken, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD };
  const first = await resetPasswordPOST(jsonRequest("/api/portal/reset-password", body));
  const second = await resetPasswordPOST(jsonRequest("/api/portal/reset-password", body));

  assert.equal(first.status, 200);
  assert.equal(second.status, 401);
});

// ---------------------------------------------------------------------------
// Row-level authorization (own-consultation-only) — same query the
// /portal/consultations/[id] Server Component uses.
// ---------------------------------------------------------------------------

test("authorization: a client cannot read another client's consultation via the same-shape query the page uses", async () => {
  const { client: owner } = await createActiveClient({ email: "owner@example.com" });
  const { client: intruder } = await createActiveClient({ email: "intruder@example.com" });

  const consultation = await Consultation.create({
    name: "Owner",
    email: "owner@example.com",
    service: "EB-1A",
    message: "Message long enough to pass validation.",
    clientUser: owner._id,
  });

  const asOwner = await Consultation.findOne({ _id: consultation._id, clientUser: owner._id });
  const asIntruder = await Consultation.findOne({ _id: consultation._id, clientUser: intruder._id });

  assert.ok(asOwner, "the owner must see their own consultation");
  assert.equal(asIntruder, null, "a different client must not see it — same as not-found");
});

test("authorization: an invalid ObjectId never reaches a Mongo query as a truthy match", () => {
  assert.equal(mongoose.Types.ObjectId.isValid("not-a-real-id"), false);
  assert.equal(mongoose.Types.ObjectId.isValid("507f1f77bcf86cd799439011"), true);
});
