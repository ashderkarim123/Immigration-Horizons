import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, cookieHeader, extractCookie, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientSession } from "../src/lib/models/ClientSession";
import { AdminUser } from "../src/lib/models/AdminUser";

import { SESSION_COOKIE_NAME, createSession, getSessionActor } from "../src/lib/auth/session";
import { EMPLOYEE_SESSION_COOKIE_NAME } from "../src/lib/auth/employee-session";
import { hashPassword } from "../src/lib/auth/crypto";
import {
  listClientSessions,
  describeUserAgent,
  updateClientProfile,
  MAX_NAME_LENGTH,
} from "../src/lib/auth/client-account";
import {
  CLIENT_NAV,
  CLIENT_ACCOUNT_NAV,
  EMPLOYEE_NAV,
  visibleEmployeeNav,
} from "../src/lib/content/app-navigation";
import { MIN_PASSWORD_LENGTH } from "../src/lib/auth/validation";

import { POST as profilePOST } from "../src/app/api/portal/profile/route";
import { POST as passwordPOST } from "../src/app/api/portal/security/password/route";
import { POST as revokePOST } from "../src/app/api/portal/security/sessions/revoke/route";
import { POST as revokeOthersPOST } from "../src/app/api/portal/security/sessions/revoke-others/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";

let counter = 0;

async function seedClient(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const email = `client-${counter}-${Date.now()}@example.com`;
  const client = await ClientUser.create({
    email,
    normalizedEmail: email,
    firstName: "Ada",
    lastName: "Example",
    phone: "+1 555 0100",
    passwordHash: await hashPassword(PASSWORD),
    status: "active",
    ...overrides,
  });
  return client;
}

/** Signs a client in and returns the cookie plus the resolved session id. */
async function signIn(clientId: unknown, meta: { userAgent?: string; ip?: string } = {}) {
  const token = await createSession(String(clientId), meta);
  const cookie = cookieHeader(SESSION_COOKIE_NAME, token);
  const actor = await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie } }));
  return { cookie, token, sessionId: actor!.sessionId };
}

// ---------------------------------------------------------------------------
// Shell and navigation
// ---------------------------------------------------------------------------

test("every client navigation destination stays inside /portal", () => {
  for (const item of [...CLIENT_NAV, ...CLIENT_ACCOUNT_NAV]) {
    assert.ok(
      item.href === "/portal" || item.href.startsWith("/portal/"),
      `${item.href} must be a portal URL`,
    );
  }
});

test("client navigation carries no capability field, so it can never be capability-gated", () => {
  for (const item of [...CLIENT_NAV, ...CLIENT_ACCOUNT_NAV]) {
    assert.equal(
      (item as { capability?: string }).capability,
      undefined,
      `${item.href} must not depend on a capability — clients hold none`,
    );
  }
});

test("no staff destination is reachable from client navigation, and vice versa", () => {
  const clientHrefs = new Set([...CLIENT_NAV, ...CLIENT_ACCOUNT_NAV].map((i) => i.href));
  const staffHrefs = new Set(EMPLOYEE_NAV.map((i) => i.href));

  for (const href of clientHrefs) {
    assert.ok(!href.startsWith("/staff"), `client nav must not link to ${href}`);
    assert.ok(!href.startsWith("/admin"), `client nav must not link to ${href}`);
    assert.ok(!staffHrefs.has(href), `${href} appears in both navigations`);
  }
  for (const href of staffHrefs) {
    assert.ok(!href.startsWith("/portal"), `staff nav must not link to ${href}`);
  }
});

test("profile and security are account destinations, not primary navigation", () => {
  const primary = CLIENT_NAV.map((i) => i.href);
  assert.ok(!primary.includes("/portal/profile"));
  assert.ok(!primary.includes("/portal/security"));

  const account = CLIENT_ACCOUNT_NAV.map((i) => i.href);
  assert.ok(account.includes("/portal/profile"));
  assert.ok(account.includes("/portal/security"));
});

test("the notification destination is not duplicated as a nav item", () => {
  // The bell in the shell is the single entry point (ADR-011 §1). A nav
  // item alongside it would give a client two unread counts to reconcile.
  assert.ok(
    !CLIENT_NAV.some((i) => i.href === "/portal/notifications"),
    "notifications belong to the bell, not the primary nav",
  );
});

test("an employee holding every capability still gets no client destination", () => {
  for (const item of visibleEmployeeNav(() => true)) {
    assert.ok(item.href.startsWith("/staff"), `${item.href} must stay inside the staff area`);
  }
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

test("profile: an unauthenticated request is rejected and changes nothing", async () => {
  const client = await seedClient();

  const res = await profilePOST(
    jsonRequest("/api/portal/profile", { firstName: "Mallory" }),
  );

  assert.equal(res.status, 401);
  assert.equal((await ClientUser.findById(client._id).lean())!.firstName, "Ada");
});

test("profile: a cross-origin request is rejected before anything else runs", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  const res = await profilePOST(
    jsonRequest(
      "/api/portal/profile",
      { firstName: "Mallory" },
      { cookie, origin: "https://evil.example.com" },
    ),
  );

  assert.equal(res.status, 403);
  assert.equal((await ClientUser.findById(client._id).lean())!.firstName, "Ada");
});

test("profile: a staff cookie cannot drive a client account route", async () => {
  const client = await seedClient();
  const employee = await AdminUser.create({
    name: "Staff",
    email: `staff-${Date.now()}@example.com`,
    password: "x",
    role: "admin",
    isActive: true,
  });

  const res = await profilePOST(
    jsonRequest(
      "/api/portal/profile",
      { firstName: "Mallory" },
      { cookie: cookieHeader(EMPLOYEE_SESSION_COOKIE_NAME, "not-a-portal-token") },
    ),
  );

  assert.equal(res.status, 401);
  assert.equal((await ClientUser.findById(client._id).lean())!.firstName, "Ada");
  assert.ok(employee);
});

test("profile: updates the session's own record and nobody else's", async () => {
  const me = await seedClient();
  const other = await seedClient();
  const { cookie } = await signIn(me._id);

  // A crafted body naming another account must be ignored entirely — the
  // record updated comes from the session, not the payload.
  const res = await profilePOST(
    jsonRequest(
      "/api/portal/profile",
      {
        firstName: "Grace",
        lastName: "Hopper",
        phone: "+44 20 7946 0000",
        clientUserId: String(other._id),
        _id: String(other._id),
        email: "attacker@example.com",
        status: "disabled",
      },
      { cookie },
    ),
  );

  assert.equal(res.status, 200);

  const mine = await ClientUser.findById(me._id).lean();
  assert.equal(mine!.firstName, "Grace");
  assert.equal(mine!.lastName, "Hopper");
  assert.equal(mine!.phone, "+44 20 7946 0000");
  assert.notEqual(mine!.email, "attacker@example.com", "email is not settable here");
  assert.equal(mine!.status, "active", "status is not settable here");

  const theirs = await ClientUser.findById(other._id).lean();
  assert.equal(theirs!.firstName, "Ada", "another client's record must be untouched");
});

test("profile: rejects an empty first name, an over-long name, and a bad phone", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  const cases: [Record<string, unknown>, string][] = [
    [{ firstName: "   ", lastName: "Example" }, "empty first name"],
    [{ firstName: "x".repeat(MAX_NAME_LENGTH + 1) }, "over-long name"],
    [{ firstName: "Ada", phone: "<script>alert(1)</script>" }, "bad phone characters"],
  ];

  for (const [body, label] of cases) {
    const res = await profilePOST(jsonRequest("/api/portal/profile", body, { cookie }));
    assert.equal(res.status, 422, `${label} must be rejected`);
  }

  assert.equal((await ClientUser.findById(client._id).lean())!.firstName, "Ada");
});

test("profile: submitting identical values reports unchanged rather than a false success", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  const res = await profilePOST(
    jsonRequest(
      "/api/portal/profile",
      { firstName: "Ada", lastName: "Example", phone: "+1 555 0100" },
      { cookie },
    ),
  );

  assert.equal(res.status, 200);
  assert.equal((await res.json()).outcome, "unchanged");
});

test("profile: a client disabled mid-session loses access on the next request", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  await ClientUser.updateOne({ _id: client._id }, { $set: { status: "disabled" } });

  const res = await profilePOST(
    jsonRequest("/api/portal/profile", { firstName: "Grace" }, { cookie }),
  );

  assert.equal(res.status, 401);
  assert.equal((await ClientUser.findById(client._id).lean())!.firstName, "Ada");
});

test("updateClientProfile collapses whitespace so display names stay tidy", async () => {
  const client = await seedClient();
  const result = await updateClientProfile(String(client._id), {
    firstName: "  Ada   Grace  ",
    lastName: " Hopper ",
    phone: " ",
  });

  assert.equal(result.outcome, "updated");
  const stored = await ClientUser.findById(client._id).lean();
  assert.equal(stored!.firstName, "Ada Grace");
  assert.equal(stored!.lastName, "Hopper");
  assert.equal(stored!.phone, "");
});

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

test("password: the wrong current password is rejected and nothing changes", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);
  const before = (await ClientUser.findById(client._id).lean())!.passwordHash;

  const res = await passwordPOST(
    jsonRequest(
      "/api/portal/security/password",
      {
        currentPassword: "not-the-password",
        newPassword: "a-brand-new-passphrase",
        confirmPassword: "a-brand-new-passphrase",
      },
      { cookie },
    ),
  );

  assert.equal(res.status, 422);
  assert.equal((await ClientUser.findById(client._id).lean())!.passwordHash, before);
});

test("password: a too-short password and a mismatch are both rejected", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  const short = await passwordPOST(
    jsonRequest(
      "/api/portal/security/password",
      {
        currentPassword: PASSWORD,
        newPassword: "a".repeat(MIN_PASSWORD_LENGTH - 1),
        confirmPassword: "a".repeat(MIN_PASSWORD_LENGTH - 1),
      },
      { cookie },
    ),
  );
  const mismatch = await passwordPOST(
    jsonRequest(
      "/api/portal/security/password",
      {
        currentPassword: PASSWORD,
        newPassword: "a-brand-new-passphrase",
        confirmPassword: "a-different-passphrase",
      },
      { cookie },
    ),
  );

  assert.equal(short.status, 422);
  assert.equal(mismatch.status, 422);
});

test("password: reusing the current password is refused", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  const res = await passwordPOST(
    jsonRequest(
      "/api/portal/security/password",
      { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
      { cookie },
    ),
  );

  assert.equal(res.status, 422);
});

test("password: a successful change revokes other devices but keeps this one", async () => {
  const client = await seedClient();
  const here = await signIn(client._id, { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" });
  const elsewhere = await signIn(client._id, { userAgent: "Mozilla/5.0 (iPhone) Safari/605" });
  const otherPerson = await seedClient();
  const theirSession = await signIn(otherPerson._id);

  const res = await passwordPOST(
    jsonRequest(
      "/api/portal/security/password",
      {
        currentPassword: PASSWORD,
        newPassword: "a-brand-new-passphrase",
        confirmPassword: "a-brand-new-passphrase",
      },
      { cookie: here.cookie },
    ),
  );

  assert.equal(res.status, 200);
  assert.equal((await res.json()).revokedSessions, 1);

  assert.ok(
    await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: here.cookie } })),
    "the device that made the change stays signed in",
  );
  assert.equal(
    await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: elsewhere.cookie } })),
    null,
    "every other device is signed out",
  );
  assert.ok(
    await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: theirSession.cookie } })),
    "another client's sessions are untouched",
  );

  const updated = await ClientUser.findById(client._id).lean();
  assert.ok(updated!.passwordChangedAt, "the change is recorded");
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test("sessions: the list shows only this client's sessions and marks the current one", async () => {
  const client = await seedClient();
  const other = await seedClient();
  const here = await signIn(client._id, { userAgent: "Mozilla/5.0 (Macintosh) Safari/605" });
  await signIn(client._id, { userAgent: "Mozilla/5.0 (Android) Chrome/120" });
  await signIn(other._id);

  const rows = await listClientSessions(String(client._id), here.sessionId);

  assert.equal(rows.length, 2, "another client's session must not be listed");
  assert.equal(rows.filter((r) => r.isCurrent).length, 1);
  assert.equal(rows.find((r) => r.isCurrent)!.id, here.sessionId);
});

test("sessions: rows carry a readable device name, never the raw user-agent", async () => {
  const rawUa =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const client = await seedClient();
  const here = await signIn(client._id, { userAgent: rawUa });

  const rows = await listClientSessions(String(client._id), here.sessionId);
  const serialized = JSON.stringify(rows);

  assert.equal(rows[0].device, "Chrome on Windows");
  assert.ok(!serialized.includes("AppleWebKit"), "the raw UA must not reach the client surface");
  assert.ok(!serialized.includes("tokenHash"), "the token hash must never be serialized");
});

test("describeUserAgent degrades safely rather than echoing unknown input", () => {
  assert.equal(describeUserAgent(""), "Unknown device");
  assert.equal(describeUserAgent("<script>alert(1)</script>"), "Browser");
  assert.equal(describeUserAgent("Mozilla/5.0 (iPhone) AppleWebKit Safari/605"), "Safari on iPhone");
});

test("sessions: revoking another client's session id fails and leaves it alive", async () => {
  const me = await seedClient();
  const other = await seedClient();
  const mine = await signIn(me._id);
  const theirs = await signIn(other._id);

  const res = await revokePOST(
    jsonRequest(
      "/api/portal/security/sessions/revoke",
      { sessionId: theirs.sessionId },
      { cookie: mine.cookie },
    ),
  );

  assert.equal(res.status, 404, "another account's session is indistinguishable from a missing one");
  assert.ok(
    await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: theirs.cookie } })),
    "their session must survive",
  );
});

test("sessions: revoking one of your own devices signs exactly that one out", async () => {
  const client = await seedClient();
  const here = await signIn(client._id);
  const elsewhere = await signIn(client._id);

  const res = await revokePOST(
    jsonRequest(
      "/api/portal/security/sessions/revoke",
      { sessionId: elsewhere.sessionId },
      { cookie: here.cookie },
    ),
  );

  assert.equal(res.status, 200);
  assert.equal((await res.json()).wasCurrent, false);
  assert.equal(
    await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: elsewhere.cookie } })),
    null,
  );
  assert.ok(await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: here.cookie } })));
});

test("sessions: revoking the current device clears the cookie and sends you to login", async () => {
  const client = await seedClient();
  const here = await signIn(client._id);

  const res = await revokePOST(
    jsonRequest(
      "/api/portal/security/sessions/revoke",
      { sessionId: here.sessionId },
      { cookie: here.cookie },
    ),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.wasCurrent, true);
  assert.equal(body.redirectTo, "/portal/login");
  assert.equal(
    extractCookie(res, SESSION_COOKIE_NAME),
    "",
    "the browser must not be left holding a token whose row is gone",
  );
});

test("sessions: an invalid session id is a 404, not a crash", async () => {
  const client = await seedClient();
  const { cookie } = await signIn(client._id);

  const res = await revokePOST(
    jsonRequest("/api/portal/security/sessions/revoke", { sessionId: "not-an-objectid" }, { cookie }),
  );

  assert.equal(res.status, 404);
});

test("sessions: sign out everywhere else keeps the device that asked", async () => {
  const client = await seedClient();
  const other = await seedClient();
  const here = await signIn(client._id);
  const second = await signIn(client._id);
  const third = await signIn(client._id);
  const theirs = await signIn(other._id);

  const res = await revokeOthersPOST(
    jsonRequest("/api/portal/security/sessions/revoke-others", {}, { cookie: here.cookie }),
  );

  assert.equal(res.status, 200);
  assert.equal((await res.json()).revokedSessions, 2);

  assert.ok(await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: here.cookie } })));
  for (const gone of [second, third]) {
    assert.equal(
      await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: gone.cookie } })),
      null,
    );
  }
  assert.ok(
    await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie: theirs.cookie } })),
    "another client keeps their sessions",
  );
  assert.equal(await ClientSession.countDocuments({ clientUser: other._id }), 1);
});

test("sessions: every security route enforces Origin and authentication", async () => {
  const client = await seedClient();
  const { cookie, sessionId } = await signIn(client._id);

  const routes: [string, (r: Request) => Promise<Response>, Record<string, unknown>][] = [
    ["/api/portal/security/password", passwordPOST, { currentPassword: PASSWORD }],
    ["/api/portal/security/sessions/revoke", revokePOST, { sessionId }],
    ["/api/portal/security/sessions/revoke-others", revokeOthersPOST, {}],
  ];

  for (const [path, handler, body] of routes) {
    const noOrigin = await handler(jsonRequest(path, body, { cookie, origin: null }));
    assert.equal(noOrigin.status, 403, `${path} must require an Origin`);

    const noSession = await handler(jsonRequest(path, body));
    assert.equal(noSession.status, 401, `${path} must require a session`);
  }

  // The session that ran the gauntlet above is still valid — none of the
  // rejected requests had a side effect.
  assert.ok(await getSessionActor(new Request(TEST_ORIGIN, { headers: { cookie } })));
});
