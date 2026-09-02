import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import bcrypt from "bcryptjs";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader } from "./helpers/http";

import { AdminUser } from "../src/lib/models/AdminUser";
import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { EmployeeSession } from "../src/lib/models/EmployeeSession";

import { EMPLOYEE_SESSION_COOKIE_NAME, getEmployeeActor } from "../src/lib/auth/employee-session";
import { getSessionActor, SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import {
  listAccessibleCasesForEmployee,
  getAccessibleCaseForEmployee,
} from "../src/lib/auth/employee-case-policy";
import { getEmployeeDashboard } from "../src/lib/dashboard/employee-dashboard";
import { getClientVisibleTeam } from "../src/lib/auth/case-policy";
import { visibleEmployeeNav } from "../src/lib/content/app-navigation";
import { roleHasCapability } from "../src/lib/auth/capabilities";
import { hashPassword } from "../src/lib/auth/crypto";

import { POST as staffLoginPOST } from "../src/app/api/staff/login/route";
import { POST as staffLogoutPOST } from "../src/app/api/staff/logout/route";
import { POST as clientLoginPOST } from "../src/app/api/portal/login/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";

let counter = 0;
async function seedEmployee(role: string) {
  counter += 1;
  const email = `staff-${Date.now()}-${counter}@example.com`;
  const user = await AdminUser.create({
    name: `Staff ${counter}`,
    email,
    // The admin CMS hashes on save via its own pre-save hook; this app
    // only ever compares, so the test seeds an already-hashed value.
    password: bcrypt.hashSync(PASSWORD, 10),
    role,
    isActive: true,
  });
  return { user, email };
}

async function signIn(email: string) {
  const res = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  const token = extractCookie(res, EMPLOYEE_SESSION_COOKIE_NAME);
  return { res, cookie: token ? cookieHeader(EMPLOYEE_SESSION_COOKIE_NAME, token) : null };
}

async function seedCaseWithEmployee(employeeId: unknown, membershipStatus: "active" | "removed" | null = "active") {
  counter += 1;
  const email = `client-${Date.now()}-${counter}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: "x", status: "active" });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: "Case",
    caseType: "other",
    primaryClient: client._id,
    projectManager: employeeId,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
  if (membershipStatus) {
    await WorkspaceMember.create({
      workspace: workspace._id,
      memberType: "employee",
      adminUser: employeeId,
      workspaceRole: "contributor",
      status: membershipStatus,
    });
  }
  return { caseDoc, workspace, client };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test("an employee can sign in and the session resolves to an employee actor", async () => {
  const { email } = await seedEmployee("pm");
  const { res, cookie } = await signIn(email);
  assert.equal(res.status, 200);
  assert.ok(cookie);

  const actor = await getEmployeeActor(new Request("http://localhost:3000/staff", { headers: { cookie: cookie! } }));
  assert.equal(actor?.type, "employee");
  assert.equal(actor?.role, "pm");
});

test("a wrong password and an unknown email both fail with the same generic error", async () => {
  const { email } = await seedEmployee("pm");

  const wrongPassword = await staffLoginPOST(
    jsonRequest("/api/staff/login", { email, password: "not-the-password" }),
  );
  const unknownEmail = await staffLoginPOST(
    jsonRequest("/api/staff/login", { email: "nobody@example.com", password: PASSWORD }),
  );

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
});

test("a deactivated employee cannot sign in, and gets no distinguishing message", async () => {
  const { user, email } = await seedEmployee("pm");
  await AdminUser.updateOne({ _id: user._id }, { $set: { isActive: false } });

  const res = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  assert.equal(res.status, 401);
  assert.equal(extractCookie(res, EMPLOYEE_SESSION_COOKIE_NAME), null);
});

test("deactivating an employee mid-session revokes the session on the next request", async () => {
  const { user, email } = await seedEmployee("pm");
  const { cookie } = await signIn(email);
  const request = new Request("http://localhost:3000/staff", { headers: { cookie: cookie! } });

  assert.ok(await getEmployeeActor(request));

  await AdminUser.updateOne({ _id: user._id }, { $set: { isActive: false } });

  const after = await getEmployeeActor(
    new Request("http://localhost:3000/staff", { headers: { cookie: cookie! } }),
  );
  assert.equal(after, null, "a deactivated employee must lose access immediately");
  assert.equal(await EmployeeSession.countDocuments({ adminUser: user._id }), 0, "the row must be revoked, not merely denied");
});

test("a role change takes effect on the next request, not at the next sign-in", async () => {
  const { user, email } = await seedEmployee("pm");
  const { cookie } = await signIn(email);

  await AdminUser.updateOne({ _id: user._id }, { $set: { role: "viewer" } });

  const actor = await getEmployeeActor(
    new Request("http://localhost:3000/staff", { headers: { cookie: cookie! } }),
  );
  assert.equal(actor?.role, "viewer", "live role must win over the session's snapshot");
});

test("staff login rejects a mismatched Origin (CSRF)", async () => {
  const { email } = await seedEmployee("pm");
  const res = await staffLoginPOST(
    jsonRequest("/api/staff/login", { email, password: PASSWORD }, { origin: "https://evil.example.com" }),
  );
  assert.equal(res.status, 403);
});

test("signing out revokes the session row", async () => {
  const { email } = await seedEmployee("pm");
  const { cookie } = await signIn(email);
  assert.equal(await EmployeeSession.countDocuments({}), 1);

  const res = await staffLogoutPOST(jsonRequest("/api/staff/logout", {}, { cookie: cookie! }));
  assert.equal(res.status, 200);
  assert.equal(await EmployeeSession.countDocuments({}), 0);
});

test("login refuses an account with no role rather than issuing a powerless session", async () => {
  counter += 1;
  const email = `norole-${Date.now()}-${counter}@example.com`;
  await AdminUser.create({
    name: "No Role",
    email,
    password: bcrypt.hashSync(PASSWORD, 10),
    role: "",
    isActive: true,
  });

  const res = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  assert.equal(res.status, 403);
  assert.equal(await EmployeeSession.countDocuments({}), 0);
});

// ---------------------------------------------------------------------------
// Actor separation — the two session types must never cross
// ---------------------------------------------------------------------------

test("a client session is not an employee session, and vice versa", async () => {
  const { email: staffEmail } = await seedEmployee("pm");
  const { cookie: staffCookie } = await signIn(staffEmail);

  const clientEmail = `crossover-${Date.now()}@example.com`;
  await ClientUser.create({
    email: clientEmail,
    normalizedEmail: clientEmail,
    passwordHash: await hashPassword(PASSWORD),
    status: "active",
  });
  const clientRes = await clientLoginPOST(
    jsonRequest("/api/portal/login", { email: clientEmail, password: PASSWORD }),
  );
  const clientCookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(clientRes, SESSION_COOKIE_NAME)!);

  // A staff cookie must not authenticate a client request...
  const clientActorFromStaff = await getSessionActor(
    new Request("http://localhost:3000/portal", { headers: { cookie: staffCookie! } }),
  );
  assert.equal(clientActorFromStaff, null);

  // ...and a client cookie must not authenticate a staff request.
  const staffActorFromClient = await getEmployeeActor(
    new Request("http://localhost:3000/staff", { headers: { cookie: clientCookie } }),
  );
  assert.equal(staffActorFromClient, null);
});

test("a client cannot obtain a staff session using their own credentials", async () => {
  const email = `client-only-${Date.now()}@example.com`;
  await ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: await hashPassword(PASSWORD),
    status: "active",
  });

  const res = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  assert.equal(res.status, 401, "a ClientUser is not an AdminUser");
  assert.equal(await EmployeeSession.countDocuments({}), 0);
});

// ---------------------------------------------------------------------------
// Row-level case access (the Cycle 8B capability widening)
// ---------------------------------------------------------------------------

test("a specialist sees only cases they are an active member of", async () => {
  const { user: writer } = await seedEmployee("petition_writer");
  const { user: other } = await seedEmployee("petition_writer");

  const mine = await seedCaseWithEmployee(writer._id, "active");
  const theirs = await seedCaseWithEmployee(other._id, "active");

  const actor = { type: "employee" as const, adminUserId: String(writer._id), role: "petition_writer" };
  const cases = await listAccessibleCasesForEmployee(actor);

  assert.equal(cases.length, 1);
  assert.equal(String(cases[0]._id), String(mine.caseDoc._id));

  assert.ok(await getAccessibleCaseForEmployee(String(mine.caseDoc._id), actor));
  assert.equal(
    await getAccessibleCaseForEmployee(String(theirs.caseDoc._id), actor),
    null,
    "another writer's case must be invisible",
  );
});

test("removing a specialist from a workspace revokes case access immediately", async () => {
  const { user: writer } = await seedEmployee("petition_writer");
  const { caseDoc, workspace } = await seedCaseWithEmployee(writer._id, "active");
  const actor = { type: "employee" as const, adminUserId: String(writer._id), role: "petition_writer" };

  assert.ok(await getAccessibleCaseForEmployee(String(caseDoc._id), actor));

  await WorkspaceMember.updateOne(
    { workspace: workspace._id, adminUser: writer._id },
    { $set: { status: "removed" } },
  );

  assert.equal(await getAccessibleCaseForEmployee(String(caseDoc._id), actor), null);
  assert.equal((await listAccessibleCasesForEmployee(actor)).length, 0);
});

test("an admin sees every case without any workspace membership (cases.view_all)", async () => {
  const { user: admin } = await seedEmployee("admin");
  const { user: writer } = await seedEmployee("petition_writer");
  await seedCaseWithEmployee(writer._id, "active");
  await seedCaseWithEmployee(writer._id, "active");

  const actor = { type: "employee" as const, adminUserId: String(admin._id), role: "admin" };
  assert.equal((await listAccessibleCasesForEmployee(actor)).length, 2);
});

test("a viewer holds no case capability and therefore sees nothing", async () => {
  const { user: viewer } = await seedEmployee("viewer");
  const { user: writer } = await seedEmployee("petition_writer");
  const { caseDoc, workspace } = await seedCaseWithEmployee(writer._id, "active");

  // Even with a membership row, the capability gate denies first.
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: viewer._id,
    workspaceRole: "contributor",
    status: "active",
  });

  const actor = { type: "employee" as const, adminUserId: String(viewer._id), role: "viewer" };
  assert.equal((await listAccessibleCasesForEmployee(actor)).length, 0);
  assert.equal(await getAccessibleCaseForEmployee(String(caseDoc._id), actor), null);
});

// ---------------------------------------------------------------------------
// Dashboard scoping and honesty
// ---------------------------------------------------------------------------

test("dashboard widgets a role cannot hold are null, not zero", async () => {
  const { user: writer } = await seedEmployee("petition_writer");
  const actor = { type: "employee" as const, adminUserId: String(writer._id), role: "petition_writer" };
  const data = await getEmployeeDashboard(actor);

  // petition_writer holds neither queries.view nor cases.assign.
  assert.equal(data.unansweredQueries, null, "no queries.view → null, not 0");
  assert.equal(data.unassignedCases, null, "no assign/view_all → null, not 0");
  // It does hold cases.view and documents.view after the Cycle 8B widening.
  assert.equal(typeof data.myCases, "number");
  assert.equal(typeof data.documentsAwaitingReview, "number");
  // Task counts are ownership-scoped and always available.
  assert.equal(typeof data.myOpenTasks, "number");
});

test("a specialist's dashboard counts only their own cases", async () => {
  const { user: writer } = await seedEmployee("petition_writer");
  const { user: other } = await seedEmployee("petition_writer");
  await seedCaseWithEmployee(writer._id, "active");
  await seedCaseWithEmployee(other._id, "active");
  await seedCaseWithEmployee(other._id, "active");

  const actor = { type: "employee" as const, adminUserId: String(writer._id), role: "petition_writer" };
  const data = await getEmployeeDashboard(actor);
  assert.equal(data.myCases, 1, "must not count the firm's other cases");
});

test("a viewer's dashboard exposes no case or document counts at all", async () => {
  const { user: viewer } = await seedEmployee("viewer");
  const actor = { type: "employee" as const, adminUserId: String(viewer._id), role: "viewer" };
  const data = await getEmployeeDashboard(actor);

  assert.equal(data.myCases, null);
  assert.equal(data.documentsAwaitingReview, null);
  assert.equal(data.unreadClientMessages, null);
});

// ---------------------------------------------------------------------------
// Client-side leakage
// ---------------------------------------------------------------------------

test("the client-visible team serializer never carries an internal role code", async () => {
  const { user: pm } = await seedEmployee("pm");
  const { workspace, client } = await seedCaseWithEmployee(pm._id, "active");
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: "active",
  });

  const team = await getClientVisibleTeam(String(workspace._id));
  const serialized = JSON.stringify(team);

  for (const role of ["pm", "petition_writer", "super_admin", "uscis_forms_specialist"]) {
    assert.ok(!serialized.includes(`"${role}"`), `client-visible team must not contain the role code "${role}"`);
  }
});

test("employee navigation is capability-filtered, and a client never receives it", () => {
  const writerNav = visibleEmployeeNav((c) => roleHasCapability("petition_writer", c));
  const writerLabels = writerNav.map((i) => i.label);
  assert.ok(writerLabels.includes("Cases"), "a writer holds cases.view after Cycle 8B");
  assert.ok(!writerLabels.includes("Clients"), "a writer holds no clients.view");
  assert.ok(!writerLabels.includes("Queries"), "a writer holds no queries.view");

  const viewerNav = visibleEmployeeNav((c) => roleHasCapability("viewer", c));
  assert.deepEqual(
    viewerNav.map((i) => i.label),
    // Operations carries no capability because every queue inside it is
    // gated individually (Cycle 8C) — a viewer lands on a page that shows
    // their own tasks and names what their role cannot hold.
    ["Dashboard", "Operations", "Tasks"],
    "a viewer gets only the always-visible items",
  );

  // Nothing in the employee nav points into the client portal.
  for (const item of visibleEmployeeNav(() => true)) {
    assert.ok(item.href.startsWith("/staff"), `${item.href} must stay inside the staff area`);
  }
});
