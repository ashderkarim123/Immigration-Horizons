import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";

import { ClientUser } from "../src/lib/models/ClientUser";
import { AdminUser } from "../src/lib/models/AdminUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { Consultation } from "../src/lib/models/Consultation";

import {
  listAccessibleCases,
  getAccessibleCase,
  getClientVisibleTeam,
} from "../src/lib/auth/case-policy";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

let emailCounter = 0;
function uniqueEmail() {
  emailCounter += 1;
  return `case-auth-${Date.now()}-${emailCounter}@example.com`;
}

async function seedClient(status: "active" | "pending" = "active") {
  const email = uniqueEmail();
  return ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: "irrelevant",
    status,
  });
}

async function seedCaseWithMembership(params: {
  clientStatus?: "active" | "pending";
  membershipStatus?: "invited" | "active" | "removed" | "suspended";
}) {
  const client = await seedClient(params.clientStatus ?? "active");
  const pm = await AdminUser.create({ name: "PM", isActive: true });
  const lead = await Consultation.create({
    name: "Case Auth Lead",
    email: client.email,
    message: "Message long enough to pass validation.",
    service: "EB-2 NIW",
    clientUser: client._id,
  });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: "Auth Test Case",
    caseType: "eb2_niw",
    consultation: lead._id,
    primaryClient: client._id,
    projectManager: pm._id,
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: "primary",
    name: "Primary Workspace",
  });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: params.membershipStatus ?? "active",
  });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: pm._id,
    workspaceRole: "project_manager",
    status: "active",
    clientVisible: true,
  });
  return { client, pm, caseDoc, workspace };
}

test("a client with an active membership can access their own case", async () => {
  const { client, caseDoc } = await seedCaseWithMembership({});
  const result = await getAccessibleCase(String(caseDoc._id), String(client._id));
  assert.ok(result);
  assert.equal(String(result!.caseDoc._id), String(caseDoc._id));
});

test("a different client cannot access a case they have no membership on — same result as a nonexistent case", async () => {
  const { caseDoc } = await seedCaseWithMembership({});
  const intruder = await seedClient();

  const asIntruder = await getAccessibleCase(String(caseDoc._id), String(intruder._id));
  const nonexistent = await getAccessibleCase(new mongoose.Types.ObjectId().toString(), String(intruder._id));

  assert.equal(asIntruder, null);
  assert.equal(nonexistent, null);
});

test("a client cannot access a case via primaryClient match alone if their membership was removed", async () => {
  const { client, caseDoc } = await seedCaseWithMembership({ membershipStatus: "removed" });
  // Confirm this really is still the primary client — the point of the
  // test is that membership status, not primaryClient, is authoritative.
  assert.equal(String(caseDoc.primaryClient), String(client._id));

  const result = await getAccessibleCase(String(caseDoc._id), String(client._id));
  assert.equal(result, null);
});

test("an invited (not yet active) membership does not grant access", async () => {
  const { client, caseDoc } = await seedCaseWithMembership({
    clientStatus: "pending",
    membershipStatus: "invited",
  });
  const result = await getAccessibleCase(String(caseDoc._id), String(client._id));
  assert.equal(result, null);
});

test("an invalid case id returns null rather than throwing", async () => {
  const { client } = await seedCaseWithMembership({});
  const result = await getAccessibleCase("not-a-valid-object-id", String(client._id));
  assert.equal(result, null);
});

test("listAccessibleCases only returns cases the client has active membership for", async () => {
  const { client, caseDoc } = await seedCaseWithMembership({});
  const other = await seedCaseWithMembership({}); // a different client's case
  void other;

  const cases = await listAccessibleCases(String(client._id));
  assert.equal(cases.length, 1);
  assert.equal(String(cases[0]._id), String(caseDoc._id));
});

test("the portal dashboard's case list never includes another client's case", async () => {
  const mine = await seedCaseWithMembership({});
  const theirs = await seedCaseWithMembership({});

  const myCases = await listAccessibleCases(String(mine.client._id));
  const theirCases = await listAccessibleCases(String(theirs.client._id));

  assert.ok(myCases.every((c) => String(c._id) !== String(theirs.caseDoc._id)));
  assert.ok(theirCases.every((c) => String(c._id) !== String(mine.caseDoc._id)));
});

test("client-visible team excludes internal role codes and shows only active, clientVisible, eligible employees", async () => {
  const { workspace, pm } = await seedCaseWithMembership({});

  // A second employee: clientVisible=false — must not appear.
  const hiddenEmployee = await AdminUser.create({ name: "Hidden Reviewer", isActive: true });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: hiddenEmployee._id,
    workspaceRole: "reviewer",
    status: "active",
    clientVisible: false,
  });

  // A third employee: removed — must not appear even though clientVisible=true.
  const removedEmployee = await AdminUser.create({ name: "Removed Person", isActive: true });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: removedEmployee._id,
    workspaceRole: "contributor",
    status: "removed",
    clientVisible: true,
    removedAt: new Date(),
  });

  // A fourth employee: no longer active in AdminUser — must not appear.
  const deactivatedEmployee = await AdminUser.create({ name: "Deactivated", isActive: false });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "employee",
    adminUser: deactivatedEmployee._id,
    workspaceRole: "contributor",
    status: "active",
    clientVisible: true,
  });

  const team = await getClientVisibleTeam(String(workspace._id));

  assert.equal(team.length, 1);
  assert.equal(team[0].name, "PM");
  assert.equal(team[0].displayRole, "Project Manager");
  void pm;
});
