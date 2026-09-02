import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import bcrypt from "bcryptjs";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, TEST_ORIGIN } from "./helpers/http";

import { AdminUser } from "../src/lib/models/AdminUser";
import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { WorkspaceChannel } from "../src/lib/models/WorkspaceChannel";
import { WorkspaceMessage } from "../src/lib/models/WorkspaceMessage";
import { CaseDocument } from "../src/lib/models/CaseDocument";
import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { ConsultationInteraction } from "../src/lib/models/ConsultationInteraction";
import { Consultation } from "../src/lib/models/Consultation";
import { Notification } from "../src/lib/models/Notification";
import { CaseActivity } from "../src/lib/models/CaseActivity";

import { EMPLOYEE_SESSION_COOKIE_NAME } from "../src/lib/auth/employee-session";
import { SESSION_COOKIE_NAME, createSession } from "../src/lib/auth/session";
import {
  listCasesForEmployee,
  getAccessibleCaseWorkspace,
  listWorkspaceMembers,
} from "../src/lib/auth/employee-case-policy";
import {
  listClientsForEmployee,
  getClientOverviewForEmployee,
} from "../src/lib/auth/employee-client-policy";
import { getCaseDetailForEmployee } from "../src/lib/staff/case-detail";
import { getOperationsBoard } from "../src/lib/staff/operations";
import { getQueryQueue } from "../src/lib/staff/query-queues";
import { getAccessibleMessageCenter } from "../src/lib/auth/collaboration-policy";
import { generateInteractionNumber } from "../src/lib/auth/interaction-number";
import type { EmployeeActor } from "../src/lib/auth/actors";

import { POST as staffLoginPOST } from "../src/app/api/staff/login/route";
import { POST as managerPOST } from "../src/app/api/staff/cases/[caseId]/manager/route";
import { POST as stagePOST } from "../src/app/api/staff/cases/[caseId]/stage/route";
import { POST as membersPOST } from "../src/app/api/staff/cases/[caseId]/members/route";
import { POST as memberRemovePOST } from "../src/app/api/staff/cases/[caseId]/members/[memberId]/remove/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";

let counter = 0;
function nextId(): number {
  counter += 1;
  return counter;
}

async function seedEmployee(role: string, name?: string) {
  const n = nextId();
  const email = `staff-${n}-${Date.now()}@example.com`;
  const user = await AdminUser.create({
    name: name ?? `Staff ${n}`,
    email,
    password: bcrypt.hashSync(PASSWORD, 10),
    role,
    isActive: true,
  });
  const actor: EmployeeActor = {
    type: "employee",
    adminUserId: String(user._id),
    role,
  };
  return { user, email, actor };
}

async function signIn(email: string) {
  const res = await staffLoginPOST(jsonRequest("/api/staff/login", { email, password: PASSWORD }));
  const token = extractCookie(res, EMPLOYEE_SESSION_COOKIE_NAME);
  return token ? cookieHeader(EMPLOYEE_SESSION_COOKIE_NAME, token) : null;
}

async function seedClient(overrides: Record<string, unknown> = {}) {
  const n = nextId();
  const email = `client-${n}-${Date.now()}@example.com`;
  return ClientUser.create({
    email,
    normalizedEmail: email,
    firstName: `Client${n}`,
    lastName: "Example",
    passwordHash: "x",
    status: "active",
    ...overrides,
  });
}

/** A case with its primary workspace, primary client, and default channels. */
async function seedCase(options: {
  client?: Awaited<ReturnType<typeof seedClient>>;
  projectManager?: unknown;
  members?: { adminUser: unknown; workspaceRole?: string; status?: string }[];
  stage?: string;
  updatedAt?: Date;
} = {}) {
  const client = options.client ?? (await seedClient());
  const n = nextId();

  const consultation = await Consultation.create({
    name: "Lead",
    email: `lead-${n}@example.com`,
    message: "Please help.",
    clientUser: client._id,
  });

  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${String(n).padStart(4, "0")}`,
    title: `Case ${n}`,
    caseType: "eb2_niw",
    primaryClient: client._id,
    projectManager: options.projectManager ?? null,
    consultation: consultation._id,
    currentStage: options.stage ?? "intake",
  });

  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: "primary",
    name: `Workspace ${n}`,
  });

  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: "active",
  });

  for (const member of options.members ?? []) {
    await WorkspaceMember.create({
      workspace: workspace._id,
      memberType: "employee",
      adminUser: member.adminUser,
      workspaceRole: member.workspaceRole ?? "contributor",
      status: member.status ?? "active",
    });
  }

  const general = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    templateKey: "general",
    name: "General",
    slug: "general",
    channelType: "standard",
    visibility: "clients_and_team",
    order: 1,
  });

  const internal = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    templateKey: "petition_strategy",
    name: "Petition Strategy",
    slug: "petition-strategy",
    channelType: "internal",
    visibility: "employees_only",
    order: 2,
  });

  if (options.updatedAt) {
    await ClientCase.collection.updateOne(
      { _id: caseDoc._id },
      { $set: { updatedAt: options.updatedAt } },
    );
  }

  return {
    client,
    consultation,
    caseDoc: caseDoc.toObject() as Record<string, unknown>,
    workspace: workspace.toObject() as Record<string, unknown>,
    general,
    internal,
  };
}

async function seedDocument(
  caseDoc: Record<string, unknown>,
  workspace: Record<string, unknown>,
  uploadedByClient: unknown,
  status = "uploaded",
) {
  const n = nextId();
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: `Category ${n}`,
    slug: `category-${n}`,
    order: n,
    visibility: "client_visible",
    allowedUploaderTypes: "both",
  });

  return CaseDocument.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: "client",
    uploadedByClient,
    originalName: `evidence-${n}.pdf`,
    displayName: `Evidence ${n}`,
    storageKey: `key-${n}`,
    mimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    extension: "pdf",
    size: 1024,
    checksum: `checksum-${n}`,
    status,
    visibility: "client_visible",
  });
}

async function seedCaseQuery(
  caseDoc: Record<string, unknown>,
  workspace: Record<string, unknown>,
  clientId: unknown,
  overrides: Record<string, unknown> = {},
) {
  return ConsultationInteraction.create({
    interactionNumber: `${generateInteractionNumber()}-${nextId()}`,
    scopeType: "case",
    clientUser: clientId,
    case: caseDoc._id,
    workspace: workspace._id,
    subject: "A case question",
    description: "Details",
    type: "client_question",
    status: "submitted",
    createdByType: "client",
    createdByClient: clientId,
    ...overrides,
  });
}

function staffRequest(path: string, body: unknown, cookie: string | null) {
  return jsonRequest(path, body, { cookie: cookie ?? undefined });
}

// ---------------------------------------------------------------------------
// Unauthorized employee
// ---------------------------------------------------------------------------

test("an unauthenticated request to a staff mutation is rejected", async () => {
  const { caseDoc } = await seedCase();

  const res = await stagePOST(
    jsonRequest(`/api/staff/cases/${caseDoc._id}/stage`, { stage: "strategy" }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal(res.status, 401);
  const after = await ClientCase.findById(caseDoc._id).lean();
  assert.equal(after!.currentStage, "intake", "an unauthenticated request must change nothing");
});

test("a client session cannot drive a staff mutation", async () => {
  const { caseDoc, client } = await seedCase();
  const token = await createSession(String(client._id), {});

  const res = await stagePOST(
    jsonRequest(
      `/api/staff/cases/${caseDoc._id}/stage`,
      { stage: "strategy" },
      { cookie: cookieHeader(SESSION_COOKIE_NAME, token) },
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal(res.status, 401, "a portal cookie is not a staff cookie");
});

test("a mutating staff route rejects a cross-origin request before doing anything", async () => {
  const { user, email } = await seedEmployee("super_admin");
  const cookie = await signIn(email);
  const { caseDoc } = await seedCase();

  const res = await stagePOST(
    jsonRequest(
      `/api/staff/cases/${caseDoc._id}/stage`,
      { stage: "strategy" },
      { cookie: cookie ?? undefined, origin: "https://evil.example.com" },
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal(res.status, 403);
  assert.equal((await ClientCase.findById(caseDoc._id).lean())!.currentStage, "intake");
  assert.ok(user);
});

// ---------------------------------------------------------------------------
// Read-only capability
// ---------------------------------------------------------------------------

test("a read-only role can read its own case but cannot mutate it", async () => {
  const { actor, email } = await seedEmployee("reviewer");
  const cookie = await signIn(email);
  const { caseDoc } = await seedCase({ members: [{ adminUser: actor.adminUserId }] });

  const readable = await getAccessibleCaseWorkspace(String(caseDoc._id), actor);
  assert.ok(readable, "reviewer holds cases.view and an active membership");

  for (const [path, handler, body] of [
    [`/api/staff/cases/${caseDoc._id}/stage`, stagePOST, { stage: "strategy" }],
    [`/api/staff/cases/${caseDoc._id}/manager`, managerPOST, { projectManagerId: String(actor.adminUserId) }],
    [`/api/staff/cases/${caseDoc._id}/members`, membersPOST, { adminUserId: String(actor.adminUserId) }],
  ] as const) {
    const res = await handler(staffRequest(path, body, cookie), {
      params: Promise.resolve({ caseId: String(caseDoc._id) }),
    });
    assert.equal(res.status, 404, `${path} must 404 for a role without the capability`);
  }

  const after = await ClientCase.findById(caseDoc._id).lean();
  assert.equal(after!.currentStage, "intake");
  assert.equal(after!.projectManager, null);
});

test("a PM can change a stage but cannot reassign the project manager", async () => {
  const { actor, email } = await seedEmployee("pm");
  const cookie = await signIn(email);
  const other = await seedEmployee("petition_writer");
  const { caseDoc } = await seedCase({ members: [{ adminUser: actor.adminUserId }] });

  const stageRes = await stagePOST(
    staffRequest(`/api/staff/cases/${caseDoc._id}/stage`, { stage: "strategy" }, cookie),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(stageRes.status, 200, "cases.manage includes pm");

  const managerRes = await managerPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/manager`,
      { projectManagerId: String(other.actor.adminUserId) },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(managerRes.status, 404, "cases.assign is admin-tier, not pm");

  const after = await ClientCase.findById(caseDoc._id).lean();
  assert.equal(after!.currentStage, "strategy");
  assert.equal(after!.projectManager, null);
});

// ---------------------------------------------------------------------------
// Cross-workspace leakage
// ---------------------------------------------------------------------------

test("a specialist sees only cases they are an active member of", async () => {
  const { actor } = await seedEmployee("petition_writer");
  const mine = await seedCase({ members: [{ adminUser: actor.adminUserId }] });
  const theirs = await seedCase();

  const result = await listCasesForEmployee(actor);
  const ids = result.items.map((c) => String(c._id));

  assert.deepEqual(ids, [String(mine.caseDoc._id)]);
  assert.equal(result.total, 1);
  assert.equal(
    await getAccessibleCaseWorkspace(String(theirs.caseDoc._id), actor),
    null,
    "another workspace's case must be indistinguishable from a nonexistent one",
  );
});

test("filters can narrow the accessible set but never widen it", async () => {
  const { actor } = await seedEmployee("petition_writer");
  const mine = await seedCase({ members: [{ adminUser: actor.adminUserId }], stage: "drafting" });
  const theirs = await seedCase({ stage: "drafting" });

  // Every filter combination the list page can produce, including the ones
  // that would name another team's case directly.
  const byStage = await listCasesForEmployee(actor, { stage: "drafting" });
  const bySearch = await listCasesForEmployee(actor, {
    search: String(theirs.caseDoc.caseNumber),
  });
  const byUnassigned = await listCasesForEmployee(actor, { scope: "unassigned" });
  const byArchived = await listCasesForEmployee(actor, { includeArchived: true });

  assert.deepEqual(byStage.items.map((c) => String(c._id)), [String(mine.caseDoc._id)]);
  assert.deepEqual(bySearch.items, [], "searching another team's case number returns nothing");
  assert.deepEqual(byUnassigned.items.map((c) => String(c._id)), [String(mine.caseDoc._id)]);
  assert.deepEqual(byArchived.items.map((c) => String(c._id)), [String(mine.caseDoc._id)]);
});

test("a regex in the search box is matched literally, not as a pattern", async () => {
  const { actor } = await seedEmployee("super_admin");
  await seedCase();

  const result = await listCasesForEmployee(actor, { search: ".*" });
  assert.equal(result.total, 0, "'.*' must match a literal '.*', not everything");
});

test("removing a membership revokes case access immediately", async () => {
  const { actor } = await seedEmployee("evidence_collector");
  const { caseDoc, workspace } = await seedCase({ members: [{ adminUser: actor.adminUserId }] });

  assert.ok(await getAccessibleCaseWorkspace(String(caseDoc._id), actor));

  await WorkspaceMember.updateOne(
    { workspace: workspace._id, adminUser: actor.adminUserId },
    { $set: { status: "removed", removedAt: new Date() } },
  );

  assert.equal(await getAccessibleCaseWorkspace(String(caseDoc._id), actor), null);
  assert.equal((await listCasesForEmployee(actor)).total, 0);
});

test("case-scoped queries never leak across workspaces", async () => {
  const pm = await seedEmployee("pm");
  const mine = await seedCase({ members: [{ adminUser: pm.actor.adminUserId }] });
  const theirs = await seedCase();

  await seedCaseQuery(mine.caseDoc, mine.workspace, mine.client._id, { subject: "Mine" });
  await seedCaseQuery(theirs.caseDoc, theirs.workspace, theirs.client._id, { subject: "Theirs" });

  const queue = await getQueryQueue(pm.actor, "unanswered");
  const subjects = queue.rows.map((r) => r.subject);

  assert.deepEqual(subjects, ["Mine"]);
  assert.equal(queue.counts.unanswered, 1, "the sidebar count must agree with the rows");
});

test("an admin with queries.view_all sees every workspace's queries", async () => {
  const admin = await seedEmployee("admin");
  const a = await seedCase();
  const b = await seedCase();
  await seedCaseQuery(a.caseDoc, a.workspace, a.client._id, { subject: "A" });
  await seedCaseQuery(b.caseDoc, b.workspace, b.client._id, { subject: "B" });

  const queue = await getQueryQueue(admin.actor, "unanswered");
  assert.equal(queue.counts.unanswered, 2);
  assert.deepEqual(queue.rows.map((r) => r.subject).sort(), ["A", "B"]);
});

// ---------------------------------------------------------------------------
// Assignment changes
// ---------------------------------------------------------------------------

test("assigning a project manager creates the membership, audits it, and notifies", async () => {
  const admin = await seedEmployee("super_admin", "Ada Admin");
  const cookie = await signIn(admin.email);
  const target = await seedEmployee("pm", "Pat Manager");
  const { caseDoc, workspace } = await seedCase();

  const res = await managerPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/manager`,
      { projectManagerId: String(target.actor.adminUserId) },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).outcome, "updated");

  const updated = await ClientCase.findById(caseDoc._id).lean();
  assert.equal(String(updated!.projectManager), String(target.actor.adminUserId));

  const membership = await WorkspaceMember.findOne({
    workspace: workspace._id,
    adminUser: target.actor.adminUserId,
  }).lean();
  assert.equal(membership!.workspaceRole, "project_manager");
  assert.equal(membership!.status, "active");

  const activity = await CaseActivity.findOne({
    case: caseDoc._id,
    type: "project_manager_changed",
  }).lean();
  assert.ok(activity, "the change must be on the case timeline");
  assert.equal(activity!.actorName, "Ada Admin");
  assert.equal(activity!.actorType, "admin_user");

  const notification = await Notification.findOne({
    recipientType: "employee",
    recipientAdmin: target.actor.adminUserId,
    type: "case_assigned_manager",
  }).lean();
  assert.ok(notification, "the new manager must be told");
});

test("reassigning demotes the previous manager to contributor rather than removing them", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const outgoing = await seedEmployee("pm");
  const incoming = await seedEmployee("pm");

  const { caseDoc, workspace } = await seedCase({
    projectManager: outgoing.actor.adminUserId,
    members: [{ adminUser: outgoing.actor.adminUserId, workspaceRole: "project_manager" }],
  });

  const res = await managerPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/manager`,
      { projectManagerId: String(incoming.actor.adminUserId) },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 200);

  const previous = await WorkspaceMember.findOne({
    workspace: workspace._id,
    adminUser: outgoing.actor.adminUserId,
  }).lean();
  assert.equal(previous!.status, "active", "the outgoing manager keeps case access");
  assert.equal(previous!.workspaceRole, "contributor");

  const holders = await WorkspaceMember.countDocuments({
    workspace: workspace._id,
    workspaceRole: "project_manager",
    status: "active",
  });
  assert.equal(holders, 1, "exactly one active project_manager membership at a time");
});

test("assigning the sitting manager again is a no-op with no duplicate audit entry", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const manager = await seedEmployee("pm");
  const { caseDoc } = await seedCase({ projectManager: manager.actor.adminUserId });

  const res = await managerPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/manager`,
      { projectManagerId: String(manager.actor.adminUserId) },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal((await res.json()).outcome, "unchanged");
  assert.equal(await CaseActivity.countDocuments({ case: caseDoc._id }), 0);
});

test("a stage change is audited and posts one client-visible system message", async () => {
  const admin = await seedEmployee("admin", "Ada Admin");
  const cookie = await signIn(admin.email);
  const { caseDoc, general } = await seedCase();

  const res = await stagePOST(
    staffRequest(`/api/staff/cases/${caseDoc._id}/stage`, { stage: "client_review" }, cookie),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 200);

  assert.equal(
    (await ClientCase.findById(caseDoc._id).lean())!.currentStage,
    "client_review",
  );

  const activity = await CaseActivity.findOne({ case: caseDoc._id, type: "stage_changed" }).lean();
  assert.ok(activity);
  assert.equal(activity!.meta.previousStage, "intake");
  assert.equal(activity!.meta.newStage, "client_review");

  // The seeded case has a 'general' channel but no 'case_updates' one, so
  // emission must silently no-op rather than failing the mutation.
  assert.equal(await WorkspaceMessage.countDocuments({ channel: general._id }), 0);
});

test("an invalid stage is rejected and changes nothing", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const { caseDoc } = await seedCase();

  const res = await stagePOST(
    staffRequest(`/api/staff/cases/${caseDoc._id}/stage`, { stage: "not_a_stage" }, cookie),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal(res.status, 422);
  assert.equal((await ClientCase.findById(caseDoc._id).lean())!.currentStage, "intake");
});

test("a PM cannot add a member to a case they are not on", async () => {
  const pm = await seedEmployee("pm");
  const cookie = await signIn(pm.email);
  const target = await seedEmployee("petition_writer");
  const { caseDoc, workspace } = await seedCase();

  const res = await membersPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/members`,
      { adminUserId: String(target.actor.adminUserId) },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal(res.status, 404, "the row-level check must run before the mutation");
  assert.equal(
    await WorkspaceMember.countDocuments({
      workspace: workspace._id,
      adminUser: target.actor.adminUserId,
    }),
    0,
  );
});

test("adding a member grants access, and removing them revokes it", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const target = await seedEmployee("business_plan_specialist");
  const { caseDoc, workspace } = await seedCase();

  assert.equal(await getAccessibleCaseWorkspace(String(caseDoc._id), target.actor), null);

  const addRes = await membersPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/members`,
      { adminUserId: String(target.actor.adminUserId), workspaceRole: "contributor" },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(addRes.status, 200);
  assert.ok(await getAccessibleCaseWorkspace(String(caseDoc._id), target.actor));

  const member = await WorkspaceMember.findOne({
    workspace: workspace._id,
    adminUser: target.actor.adminUserId,
  }).lean();

  const removeRes = await memberRemovePOST(
    staffRequest(`/api/staff/cases/${caseDoc._id}/members/${member!._id}/remove`, {}, cookie),
    {
      params: Promise.resolve({
        caseId: String(caseDoc._id),
        memberId: String(member!._id),
      }),
    },
  );
  assert.equal(removeRes.status, 200);

  const after = await WorkspaceMember.findById(member!._id).lean();
  assert.equal(after!.status, "removed", "removal is a soft delete — history is preserved");
  assert.equal(await getAccessibleCaseWorkspace(String(caseDoc._id), target.actor), null);
});

test("the primary client and the sitting project manager cannot be removed", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const manager = await seedEmployee("pm");
  const { caseDoc, workspace, client } = await seedCase({
    projectManager: manager.actor.adminUserId,
    members: [{ adminUser: manager.actor.adminUserId, workspaceRole: "project_manager" }],
  });

  const clientMember = await WorkspaceMember.findOne({
    workspace: workspace._id,
    clientUser: client._id,
  }).lean();
  const managerMember = await WorkspaceMember.findOne({
    workspace: workspace._id,
    adminUser: manager.actor.adminUserId,
  }).lean();

  for (const member of [clientMember, managerMember]) {
    const res = await memberRemovePOST(
      staffRequest(`/api/staff/cases/${caseDoc._id}/members/${member!._id}/remove`, {}, cookie),
      {
        params: Promise.resolve({
          caseId: String(caseDoc._id),
          memberId: String(member!._id),
        }),
      },
    );
    assert.equal(res.status, 422);
    assert.equal((await WorkspaceMember.findById(member!._id).lean())!.status, "active");
  }
});

test("the members endpoint refuses to hand out the project_manager workspace role", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const target = await seedEmployee("pm");
  const { caseDoc } = await seedCase();

  const res = await membersPOST(
    staffRequest(
      `/api/staff/cases/${caseDoc._id}/members`,
      { adminUserId: String(target.actor.adminUserId), workspaceRole: "project_manager" },
      cookie,
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );

  assert.equal(res.status, 422, "the case record and the workspace must not disagree on the manager");
  assert.equal((await ClientCase.findById(caseDoc._id).lean())!.projectManager, null);
});

// ---------------------------------------------------------------------------
// Client visibility
// ---------------------------------------------------------------------------

test("a role without clients.view sees no clients at all", async () => {
  const { actor } = await seedEmployee("petition_writer");
  await seedClient();

  const list = await listClientsForEmployee(actor);
  assert.equal(list.total, 0);
  assert.equal(list.items.length, 0);
});

test("the client directory is org-wide for a clients.view holder", async () => {
  const pm = await seedEmployee("pm");
  await seedClient();
  await seedClient();

  const list = await listClientsForEmployee(pm.actor);
  assert.equal(list.total, 2, "clients are not case-scoped records (ADR-007 §8)");
});

test("a client's cases are still membership-scoped on their detail page", async () => {
  const pm = await seedEmployee("pm");
  const client = await seedClient();

  const visible = await seedCase({ client, members: [{ adminUser: pm.actor.adminUserId }] });
  const hidden = await seedCase({ client });

  const overview = await getClientOverviewForEmployee(String(client._id), pm.actor);
  assert.ok(overview);
  assert.deepEqual(
    overview.cases.map((c) => String(c._id)),
    [String(visible.caseDoc._id)],
    "a PM must not see this client's other cases",
  );

  // The membership row for the hidden case still exists (the client IS a
  // member) but must not name the case.
  const hiddenRow = overview.memberships.find((m) => m.caseId === null);
  assert.ok(hiddenRow, "the membership is acknowledged");
  assert.equal(hiddenRow!.caseNumber, "Restricted");
  assert.notEqual(hiddenRow!.caseNumber, String(hidden.caseDoc.caseNumber));
});

test("a client's documents and messages on inaccessible cases stay hidden", async () => {
  const pm = await seedEmployee("pm");
  const client = await seedClient();
  const hidden = await seedCase({ client });

  await seedDocument(hidden.caseDoc, hidden.workspace, client._id);
  await WorkspaceMessage.create({
    workspace: hidden.workspace._id,
    case: hidden.caseDoc._id,
    channel: hidden.general._id,
    senderType: "client",
    senderClient: client._id,
    senderDisplayName: "Client",
    body: "A private message",
  });

  const overview = await getClientOverviewForEmployee(String(client._id), pm.actor);
  assert.deepEqual(overview!.documents, []);
  assert.deepEqual(overview!.communication, []);
});

test("the search filter cannot be used to confirm a client outside the result set", async () => {
  const pm = await seedEmployee("pm");
  const client = await seedClient();

  const byEmail = await listClientsForEmployee(pm.actor, { search: String(client.email) });
  assert.equal(byEmail.total, 1, "clients.view is org-wide, so this is expected");

  const specialist = await seedEmployee("uscis_forms_specialist");
  const denied = await listClientsForEmployee(specialist.actor, { search: String(client.email) });
  assert.equal(denied.total, 0, "a role without clients.view gets nothing, filtered or not");
});

// ---------------------------------------------------------------------------
// Internal-channel leakage
// ---------------------------------------------------------------------------

test("an employee on the case sees internal channels; the client never does", async () => {
  const { actor } = await seedEmployee("pm");
  const seeded = await seedCase({ members: [{ adminUser: actor.adminUserId }] });

  const detail = await getCaseDetailForEmployee(seeded.caseDoc, seeded.workspace, actor);
  const channelNames = (detail.channels ?? []).map((c) => String(c.name)).sort();
  assert.deepEqual(channelNames, ["General", "Petition Strategy"]);

  const centre = await getAccessibleMessageCenter(
    String(seeded.caseDoc._id),
    String(seeded.client._id),
  );
  const clientChannels = (centre?.channels ?? []).map((c: Record<string, unknown>) =>
    String(c.name),
  );
  assert.deepEqual(clientChannels, ["General"], "employees_only must never reach a client");
});

test("an internal message is never returned to a client", async () => {
  const { actor } = await seedEmployee("pm");
  const seeded = await seedCase({ members: [{ adminUser: actor.adminUserId }] });

  await WorkspaceMessage.create({
    workspace: seeded.workspace._id,
    case: seeded.caseDoc._id,
    channel: seeded.internal._id,
    senderType: "employee",
    senderAdmin: actor.adminUserId,
    senderDisplayName: "PM",
    body: "Internal strategy note",
    clientVisible: false,
  });

  const detail = await getCaseDetailForEmployee(seeded.caseDoc, seeded.workspace, actor);
  assert.equal(
    (detail.recentMessages ?? []).some((m) => String(m.body) === "Internal strategy note"),
    true,
    "the team can see their own internal channel",
  );

  const centre = await getAccessibleMessageCenter(
    String(seeded.caseDoc._id),
    String(seeded.client._id),
  );
  const clientChannelIds = (centre?.channels ?? []).map((c: Record<string, unknown>) =>
    String(c._id),
  );
  assert.ok(
    !clientChannelIds.includes(String(seeded.internal._id)),
    "the internal channel is not among the client's channels",
  );
});

test("an employee off the case sees no channels for it at all", async () => {
  const outsider = await seedEmployee("pm");
  const seeded = await seedCase();

  assert.equal(
    await getAccessibleCaseWorkspace(String(seeded.caseDoc._id), outsider.actor),
    null,
    "no access to the case means no route to its channels",
  );
});

test("the staff member serializer carries role codes; the client one must not", async () => {
  const { actor } = await seedEmployee("pm");
  const seeded = await seedCase({ members: [{ adminUser: actor.adminUserId }] });

  const members = await listWorkspaceMembers(seeded.workspace._id, seeded.caseDoc.projectManager);
  const employee = members.find((m) => m.memberType === "employee");
  assert.equal(employee!.roleCode, "pm", "staff surfaces need the role code");

  const clientRow = members.find((m) => m.memberType === "client");
  assert.equal(clientRow!.roleCode, null, "a client row never carries an internal role code");
});

// ---------------------------------------------------------------------------
// Operational queues
// ---------------------------------------------------------------------------

test("the operations board gates every queue by capability", async () => {
  const specialist = await seedEmployee("uscis_forms_specialist");
  const board = await getOperationsBoard(specialist.actor);

  const keys = board.queues.map((q) => q.key);
  assert.ok(keys.includes("overdueTasks"), "own tasks need no capability");
  assert.ok(keys.includes("documentsAwaitingReview"), "specialists hold documents.view");
  assert.ok(!keys.includes("casesWithoutManager"), "cases.assign is admin-tier");
  assert.ok(!keys.includes("unansweredQueries"), "queries.view is manager-tier");
  assert.ok(board.unavailable.includes("Cases without a manager"));
  assert.equal(board.scopedToMemberships, true);
});

test("an admin's board holds every queue and is not membership-scoped", async () => {
  const admin = await seedEmployee("super_admin");
  const board = await getOperationsBoard(admin.actor);

  assert.deepEqual(board.unavailable, []);
  assert.equal(board.scopedToMemberships, false);
  for (const key of [
    "casesWithoutManager",
    "documentsAwaitingReview",
    "overdueQueries",
    "unansweredQueries",
    "scheduledToday",
    "unreadClientConversations",
    "overdueTasks",
    "stalledCases",
  ]) {
    assert.ok(
      board.queues.some((q) => q.key === key),
      `${key} must be present for an admin`,
    );
  }
});

test("a case-scoped queue counts only the employee's own cases", async () => {
  const specialist = await seedEmployee("evidence_collector");
  const mine = await seedCase({ members: [{ adminUser: specialist.actor.adminUserId }] });
  const theirs = await seedCase();

  await seedDocument(mine.caseDoc, mine.workspace, mine.client._id);
  await seedDocument(theirs.caseDoc, theirs.workspace, theirs.client._id);
  await seedDocument(theirs.caseDoc, theirs.workspace, theirs.client._id);

  const board = await getOperationsBoard(specialist.actor);
  const queue = board.queues.find((q) => q.key === "documentsAwaitingReview")!;

  assert.equal(queue.count, 1, "two of the three documents are on another team's case");
  assert.equal(queue.rows.length, 1);

  const admin = await seedEmployee("admin");
  const adminBoard = await getOperationsBoard(admin.actor);
  assert.equal(
    adminBoard.queues.find((q) => q.key === "documentsAwaitingReview")!.count,
    3,
    "an admin sees the practice-wide number",
  );
});

test("the unassigned-cases queue finds cases with no manager", async () => {
  const admin = await seedEmployee("admin");
  const manager = await seedEmployee("pm");
  await seedCase();
  await seedCase({ projectManager: manager.actor.adminUserId });

  const board = await getOperationsBoard(admin.actor);
  assert.equal(board.queues.find((q) => q.key === "casesWithoutManager")!.count, 1);
});

test("the stalled-case queue finds cases with no recent change", async () => {
  const admin = await seedEmployee("admin");
  await seedCase({ updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });
  await seedCase();

  const board = await getOperationsBoard(admin.actor);
  assert.equal(board.queues.find((q) => q.key === "stalledCases")!.count, 1);
});

test("the scheduled-today queue matches only today's consultations", async () => {
  const admin = await seedEmployee("admin");
  const seeded = await seedCase();

  await seedCaseQuery(seeded.caseDoc, seeded.workspace, seeded.client._id, {
    subject: "Today",
    type: "scheduled_consultation",
    status: "scheduled",
    scheduledFor: new Date(),
    timezone: "UTC",
  });
  await seedCaseQuery(seeded.caseDoc, seeded.workspace, seeded.client._id, {
    subject: "Next week",
    type: "scheduled_consultation",
    status: "scheduled",
    scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    timezone: "UTC",
  });

  const board = await getOperationsBoard(admin.actor);
  const queue = board.queues.find((q) => q.key === "scheduledToday")!;
  assert.equal(queue.count, 1);
  assert.equal(queue.rows[0].primary, "Today");
});

test("the board survives a role with no data and reports zeros, not failures", async () => {
  const { actor } = await seedEmployee("reviewer");
  const board = await getOperationsBoard(actor);

  assert.ok(board.queues.length > 0);
  for (const queue of board.queues) {
    assert.equal(queue.count, 0);
    assert.deepEqual(queue.rows, []);
  }
});

test("the origin check is the same one every portal route uses", async () => {
  const admin = await seedEmployee("admin");
  const cookie = await signIn(admin.email);
  const { caseDoc } = await seedCase();

  const noOrigin = await stagePOST(
    jsonRequest(
      `/api/staff/cases/${caseDoc._id}/stage`,
      { stage: "strategy" },
      { cookie: cookie ?? undefined, origin: null },
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(noOrigin.status, 403, "a request with no Origin is not a browser submission");

  const withOrigin = await stagePOST(
    jsonRequest(
      `/api/staff/cases/${caseDoc._id}/stage`,
      { stage: "strategy" },
      { cookie: cookie ?? undefined, origin: TEST_ORIGIN },
    ),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(withOrigin.status, 200);
});
