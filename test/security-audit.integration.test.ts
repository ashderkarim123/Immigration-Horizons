import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import bcrypt from "bcryptjs";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, nextTestIp } from "./helpers/http";

import { AdminUser } from "../src/lib/models/AdminUser";
import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientSession } from "../src/lib/models/ClientSession";
import { SecurityEvent } from "../src/lib/models/SecurityEvent";
import { PasswordResetToken } from "../src/lib/models/PasswordResetToken";

import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { EMPLOYEE_SESSION_COOKIE_NAME } from "../src/lib/auth/employee-session";
import { hashPassword, hashToken, generateToken } from "../src/lib/auth/crypto";
import { MAX_FAILED_LOGIN_ATTEMPTS } from "../src/lib/auth/lockout";

import { POST as clientLoginPOST } from "../src/app/api/portal/login/route";
import { POST as clientLogoutPOST } from "../src/app/api/portal/logout/route";
import { POST as staffLoginPOST } from "../src/app/api/staff/login/route";
import { POST as staffLogoutPOST } from "../src/app/api/staff/logout/route";
import { POST as passwordChangePOST } from "../src/app/api/portal/security/password/route";
import { POST as revokeOthersPOST } from "../src/app/api/portal/security/sessions/revoke-others/route";
import { POST as forgotPasswordPOST } from "../src/app/api/portal/forgot-password/route";
import { POST as resetPasswordPOST } from "../src/app/api/portal/reset-password/route";
import { POST as stagePOST } from "../src/app/api/staff/cases/[caseId]/stage/route";

/**
 * Security audit + account-lockout integration tests (ADR-012).
 *
 * These drive the real Route Handlers with real `Request` objects against a
 * real (disposable) database, the same way every other integration suite in
 * this app does — see ADR-001 decision 8.
 */

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";

let counter = 0;

async function seedClient(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const email = `client-${Date.now()}-${counter}@example.com`;
  const client = await ClientUser.create({
    email,
    normalizedEmail: email.toLowerCase(),
    firstName: "Test",
    lastName: "Client",
    passwordHash: await hashPassword(PASSWORD),
    status: "active",
    ...overrides,
  });
  return { client, email };
}

async function seedEmployee(role = "pm", overrides: Record<string, unknown> = {}) {
  counter += 1;
  const email = `staff-${Date.now()}-${counter}@example.com`;
  const user = await AdminUser.create({
    name: `Staff ${counter}`,
    email,
    password: bcrypt.hashSync(PASSWORD, 10),
    role,
    isActive: true,
    ...overrides,
  });
  return { user, email };
}

async function events(filter: Record<string, unknown> = {}) {
  return SecurityEvent.find(filter).sort({ createdAt: 1 }).lean();
}

// ---------------------------------------------------------------------------
// Authentication is recorded
// ---------------------------------------------------------------------------

test("a successful client login is recorded with the account it belongs to", async () => {
  const { client, email } = await seedClient();

  const res = await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  assert.equal(res.status, 200);

  const [event] = await events({ type: "login_succeeded" });
  assert.equal(event.result, "success");
  assert.equal(event.surface, "portal");
  assert.equal(event.actorType, "client");
  assert.equal(String(event.actorClient), String(client._id));
  assert.equal(event.subjectEmail, email.toLowerCase());
  assert.equal(event.actorAdmin, null);
});

test("a failed client login distinguishes an unknown account from a wrong password — in the log only", async () => {
  const { email } = await seedClient();

  const unknown = await clientLoginPOST(
    jsonRequest("/api/portal/login", { email: "nobody@example.com", password: PASSWORD }),
  );
  const wrongPassword = await clientLoginPOST(
    jsonRequest("/api/portal/login", { email, password: "wrong-password" }),
  );

  // The caller learns nothing: same status, same message.
  assert.equal(unknown.status, wrongPassword.status);
  assert.deepEqual(await unknown.json(), await wrongPassword.json());

  // The operator learns everything.
  const logged = await events({ type: "login_failed" });
  assert.deepEqual(
    logged.map((e) => e.meta.reason),
    ["no_such_account", "bad_password"],
  );
  assert.equal(logged[0].actorClient, null, "an unknown account has no id to attribute");
  assert.ok(logged[1].actorClient, "a known account is attributed even on failure");
});

test("a successful employee login is recorded against the AdminUser, with the role", async () => {
  const { user, email } = await seedEmployee("pm");

  const res = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  assert.equal(res.status, 200);

  const [event] = await events({ type: "login_succeeded" });
  assert.equal(event.surface, "staff");
  assert.equal(event.actorType, "admin_user");
  assert.equal(String(event.actorAdmin), String(user._id));
  assert.equal(event.meta.role, "pm");
  assert.equal(event.actorClient, null);
});

test("logout is recorded for both actor types, attributed before the session is destroyed", async () => {
  const { client, email } = await seedClient();
  const loginRes = await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  const clientCookie = cookieHeader(
    SESSION_COOKIE_NAME,
    extractCookie(loginRes, SESSION_COOKIE_NAME)!,
  );
  await clientLogoutPOST(jsonRequest("/api/portal/logout", {}, { cookie: clientCookie }));

  const { user, email: staffEmail } = await seedEmployee();
  const staffLogin = await staffLoginPOST(
    jsonRequest("/api/staff/login", { email: staffEmail, password: PASSWORD }),
  );
  const staffCookie = cookieHeader(
    EMPLOYEE_SESSION_COOKIE_NAME,
    extractCookie(staffLogin, EMPLOYEE_SESSION_COOKIE_NAME)!,
  );
  await staffLogoutPOST(jsonRequest("/api/staff/logout", {}, { cookie: staffCookie }));

  const logouts = await events({ type: "logout" });
  assert.equal(logouts.length, 2);

  const portalLogout = logouts.find((e) => e.surface === "portal")!;
  const staffLogout = logouts.find((e) => e.surface === "staff")!;
  assert.equal(String(portalLogout.actorClient), String(client._id));
  assert.equal(String(staffLogout.actorAdmin), String(user._id));
});

// ---------------------------------------------------------------------------
// Lockout — the control the employee surfaces were missing
// ---------------------------------------------------------------------------

test("an employee account locks after the threshold, and the correct password then fails", async () => {
  const { user, email } = await seedEmployee();

  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
    const res = await staffLoginPOST(
      jsonRequest("/api/staff/login", { email, password: "wrong" }, { ip: nextTestIp() }),
    );
    assert.equal(res.status, 401);
  }

  const locked = await AdminUser.findById(user._id).lean();
  assert.ok((locked as { lockedUntil?: Date }).lockedUntil, "the account should be locked");

  // The right password is now refused, and refused identically.
  const res = await staffLoginPOST(
    jsonRequest("/api/staff/login", { email, password: PASSWORD }, { ip: nextTestIp() }),
  );
  assert.equal(res.status, 401);
  assert.equal(extractCookie(res, EMPLOYEE_SESSION_COOKIE_NAME), null, "no session may be issued");

  const lockEvents = await events({ type: "account_locked" });
  assert.equal(lockEvents.length, 1);
  assert.equal(lockEvents[0].surface, "staff");
  assert.equal(String(lockEvents[0].actorAdmin), String(user._id));
});

test("the employee lockout survives a change of IP — it is per account, not per host", async () => {
  // This is the whole reason the lockout exists alongside the rate limiter:
  // rotating IPs defeats the limiter but must not defeat the lockout.
  const { email } = await seedEmployee();

  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
    await staffLoginPOST(
      jsonRequest("/api/staff/login", { email, password: "wrong" }, { ip: `203.0.113.${i + 1}` }),
    );
  }

  const res = await staffLoginPOST(
    jsonRequest("/api/staff/login", { email, password: PASSWORD }, { ip: "198.51.100.77" }),
  );
  assert.equal(res.status, 401, "a fresh IP must not bypass the account lock");
});

test("a correct password against a deactivated employee does not consume the lockout budget", async () => {
  const { user, email } = await seedEmployee("pm", { isActive: false });

  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS + 2; i += 1) {
    await staffLoginPOST(
      jsonRequest("/api/staff/login", { email, password: PASSWORD }, { ip: nextTestIp() }),
    );
  }

  const stored = await AdminUser.findById(user._id).lean();
  const row = stored as { failedLoginCount?: number; lockedUntil?: Date | null };
  assert.equal(row.failedLoginCount || 0, 0);
  assert.equal(row.lockedUntil ?? null, null);

  const denials = await events({ type: "login_failed" });
  assert.ok(denials.every((e) => e.meta.reason === "account_deactivated"));
});

test("a client account still locks, and the lock is recorded once, not per attempt", async () => {
  const { email } = await seedClient();

  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS + 3; i += 1) {
    await clientLoginPOST(
      jsonRequest("/api/portal/login", { email, password: "wrong" }, { ip: nextTestIp() }),
    );
  }

  const lockEvents = await events({ type: "account_locked" });
  assert.equal(lockEvents.length, 1, "the lock is an event, not a state repeated on every attempt");
});

test("a login attempt against a locked account never writes a lockedUntil into the log's metadata as a credential", async () => {
  const { email } = await seedClient();
  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
    await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: "wrong" }, { ip: nextTestIp() }));
  }

  const [lock] = await events({ type: "account_locked" });
  assert.match(String(lock.meta.lockedUntil), /^\d{4}-\d{2}-\d{2}T/);
});

// ---------------------------------------------------------------------------
// Account lifecycle
// ---------------------------------------------------------------------------

test("a password change is recorded, and a wrong current password is recorded as a failure", async () => {
  const { client, email } = await seedClient();
  const login = await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(login, SESSION_COOKIE_NAME)!);

  const wrong = await passwordChangePOST(
    jsonRequest(
      "/api/portal/security/password",
      { currentPassword: "not-it", newPassword: "a-new-long-password", confirmPassword: "a-new-long-password" },
      { cookie, ip: nextTestIp() },
    ),
  );
  assert.equal(wrong.status, 422);

  const ok = await passwordChangePOST(
    jsonRequest(
      "/api/portal/security/password",
      { currentPassword: PASSWORD, newPassword: "a-new-long-password", confirmPassword: "a-new-long-password" },
      { cookie, ip: nextTestIp() },
    ),
  );
  assert.equal(ok.status, 200);

  const changes = await events({ type: "password_changed" });
  assert.deepEqual(
    changes.map((e) => e.result),
    ["failure", "success"],
  );
  assert.equal(changes[0].meta.reason, "wrong_current_password");
  assert.equal(String(changes[1].actorClient), String(client._id));
});

test("a mismatched confirmation is NOT logged as a credential guess", async () => {
  // Ordinary form noise must not dilute the signal a real guess produces.
  const { email } = await seedClient();
  const login = await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(login, SESSION_COOKIE_NAME)!);

  await passwordChangePOST(
    jsonRequest(
      "/api/portal/security/password",
      { currentPassword: PASSWORD, newPassword: "a-new-long-password", confirmPassword: "different-entirely" },
      { cookie, ip: nextTestIp() },
    ),
  );

  assert.equal((await events({ type: "password_changed" })).length, 0);
});

test("a reset request is recorded whether or not the account exists, without telling the caller", async () => {
  const { email } = await seedClient();

  const known = await forgotPasswordPOST(jsonRequest("/api/portal/forgot-password", { email }, { ip: nextTestIp() }));
  const unknown = await forgotPasswordPOST(
    jsonRequest("/api/portal/forgot-password", { email: "nobody@example.com" }, { ip: nextTestIp() }),
  );

  assert.deepEqual(await known.json(), await unknown.json(), "responses must be indistinguishable");

  const requests = await events({ type: "password_reset_requested" });
  assert.deepEqual(
    requests.map((e) => e.result),
    ["success", "failure"],
  );
  assert.equal(requests[1].meta.reason, "no_such_account");
});

test("replaying a consumed reset token is recorded as already_used", async () => {
  const { client } = await seedClient();
  const token = generateToken();
  await PasswordResetToken.create({
    clientUser: client._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const body = { token, password: "a-brand-new-password", confirmPassword: "a-brand-new-password" };
  const first = await resetPasswordPOST(jsonRequest("/api/portal/reset-password", body, { ip: nextTestIp() }));
  assert.equal(first.status, 200);

  const replay = await resetPasswordPOST(jsonRequest("/api/portal/reset-password", body, { ip: nextTestIp() }));
  assert.equal(replay.status, 401);

  const resets = await events({ type: "password_reset_completed" });
  assert.deepEqual(
    resets.map((e) => e.result),
    ["success", "failure"],
  );
  assert.equal(resets[1].meta.reason, "already_used");
});

test("revoking other sessions is recorded with how many were revoked", async () => {
  const { client, email } = await seedClient();

  const first = await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }, { ip: nextTestIp() }));
  await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }, { ip: nextTestIp() }));
  await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }, { ip: nextTestIp() }));
  assert.equal(await ClientSession.countDocuments({ clientUser: client._id }), 3);

  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(first, SESSION_COOKIE_NAME)!);
  const res = await revokeOthersPOST(
    jsonRequest("/api/portal/security/sessions/revoke-others", {}, { cookie, ip: nextTestIp() }),
  );
  assert.equal(res.status, 200);

  const [revoked] = await events({ type: "session_revoked" });
  assert.equal(revoked.meta.scope, "others");
  assert.equal(revoked.meta.revokedSessions, 2);
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test("a capability denial on a staff route is recorded even though the caller sees a 404", async () => {
  // `evidence_collector` holds no `cases.manage_stage`.
  const { user, email } = await seedEmployee("evidence_collector");
  const login = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  const cookie = cookieHeader(
    EMPLOYEE_SESSION_COOKIE_NAME,
    extractCookie(login, EMPLOYEE_SESSION_COOKIE_NAME)!,
  );

  const res = await stagePOST(
    jsonRequest("/api/staff/cases/0123456789abcdef01234567/stage", { stage: "preparation" }, { cookie, ip: nextTestIp() }),
    { params: Promise.resolve({ caseId: "0123456789abcdef01234567" }) },
  );

  assert.equal(res.status, 404, "the caller must not learn a capability boundary exists");

  const [denial] = await events({ type: "permission_denied" });
  assert.equal(denial.result, "denied");
  assert.equal(denial.surface, "staff");
  assert.equal(String(denial.actorAdmin), String(user._id));
  assert.equal(denial.meta.capability, "cases.manage");
  assert.equal(denial.meta.role, "evidence_collector");
});

test("a bad Origin is recorded as csrf_rejected on both applications", async () => {
  const { email } = await seedClient();
  await clientLoginPOST(
    jsonRequest("/api/portal/login", { email, password: PASSWORD }, { origin: "https://evil.example" }),
  );

  const { email: staffEmail } = await seedEmployee();
  await staffLoginPOST(
    jsonRequest("/api/staff/login", { email: staffEmail, password: PASSWORD }, { origin: "https://evil.example" }),
  );

  const rejected = await events({ type: "csrf_rejected" });
  assert.deepEqual(rejected.map((e) => e.surface).sort(), ["portal", "staff"]);
  assert.ok(rejected.every((e) => e.result === "denied"));
  assert.ok(rejected.every((e) => e.actorType === "anonymous"));
});

// ---------------------------------------------------------------------------
// What the log must never contain
// ---------------------------------------------------------------------------

test("no security event anywhere contains a password, a token, or a session cookie", async () => {
  const { client, email } = await seedClient();

  // Exercise a broad spread of the recording call sites in one pass.
  await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: "wrong" }, { ip: nextTestIp() }));
  const login = await clientLoginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }, { ip: nextTestIp() }));
  const sessionToken = extractCookie(login, SESSION_COOKIE_NAME)!;
  const cookie = cookieHeader(SESSION_COOKIE_NAME, sessionToken);

  await passwordChangePOST(
    jsonRequest(
      "/api/portal/security/password",
      { currentPassword: PASSWORD, newPassword: "another-long-password", confirmPassword: "another-long-password" },
      { cookie, ip: nextTestIp() },
    ),
  );

  const resetToken = generateToken();
  await PasswordResetToken.create({
    clientUser: client._id,
    tokenHash: hashToken(resetToken),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await resetPasswordPOST(
    jsonRequest(
      "/api/portal/reset-password",
      { token: resetToken, password: "yet-another-long-one", confirmPassword: "yet-another-long-one" },
      { ip: nextTestIp() },
    ),
  );

  const all = await events();
  assert.ok(all.length >= 4, "the sweep should have produced several events to scan");

  const serialized = JSON.stringify(all);
  for (const secret of [PASSWORD, "another-long-password", "yet-another-long-one", sessionToken, resetToken]) {
    assert.equal(
      serialized.includes(secret),
      false,
      `a secret leaked into the security log: ${secret.slice(0, 12)}…`,
    );
  }

  // And the stored password hash never appears either.
  const stored = await ClientUser.findById(client._id).lean();
  assert.equal(serialized.includes((stored as { passwordHash: string }).passwordHash), false);
});

test("an audit write failure never breaks the request it is auditing", async () => {
  // The recorder is deliberately fail-open (ADR-012 §2): losing an entry is
  // preferable to locking every user out of the platform. Forcing a write
  // error must therefore still leave a working login.
  const { email } = await seedClient();

  const original = SecurityEvent.create;
  (SecurityEvent as unknown as { create: unknown }).create = async () => {
    throw new Error("simulated audit outage");
  };

  try {
    const res = await clientLoginPOST(
      jsonRequest("/api/portal/login", { email, password: PASSWORD }, { ip: nextTestIp() }),
    );
    assert.equal(res.status, 200, "the login must still succeed");
    assert.ok(extractCookie(res, SESSION_COOKIE_NAME), "and must still issue a session");
  } finally {
    (SecurityEvent as unknown as { create: unknown }).create = original;
  }
});
