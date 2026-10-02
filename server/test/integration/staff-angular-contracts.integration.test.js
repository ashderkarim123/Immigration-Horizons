/**
 * Stabilization Phase 01, Batch A: pins the exact request/response fields the Angular
 * staff app depends on. Angular specs use fixtures shaped like these responses, so a
 * change here must be mirrored there (and vice versa) — that is the point.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const CaseActivity = require('../../models/CaseActivity');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function login(email, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password });
  assert.equal(res.status, 200);
  return agent;
}

async function staffAgent(role, { workspace = null, workspaceRole = 'project_manager' } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  if (workspace) {
    await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole, status: 'active' });
  }
  return { agent: await login(email), user };
}

async function seedCase({ archived = false, title = 'Contract case' } = {}) {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', lastName: 'Client', status: 'active' });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title,
    caseType: 'other',
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
    archivedAt: archived ? new Date() : null,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  await WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  return { client, owner, caseDoc, workspace };
}

// ---------------------------------------------------------------------------
// A1 — first-login permanent password
// ---------------------------------------------------------------------------

test('first-login setup: currentPassword + newPassword + confirmPassword (12+) completes setup and unlocks the staff API', async () => {
  const email = `${unique('temp')}@ih.test`;
  await AdminUser.create({ name: 'Temp', email, password: PASSWORD, role: 'admin', mustChangePassword: true, isActive: true });
  const agent = await login(email);

  assert.equal((await agent.get('/api/v1/staff/cases')).status, 403);

  const setup = (body) => agent.post('/api/v1/staff/account/initial-password').set('Origin', ORIGIN).send(body);
  const newPassword = 'a-much-longer-password-1';

  // Angular's former payload (no confirmPassword, 8 chars) must stay rejected.
  assert.equal((await setup({ currentPassword: PASSWORD, newPassword: 'short-pw' })).status, 400);
  assert.equal((await setup({ currentPassword: PASSWORD, newPassword })).status, 400, 'confirmPassword is required');
  assert.equal((await setup({ currentPassword: PASSWORD, newPassword, confirmPassword: 'different-password-1' })).status, 400);
  assert.equal((await setup({ currentPassword: PASSWORD, newPassword: 'only-11-chr', confirmPassword: 'only-11-chr' })).status, 400);

  const ok = await setup({ currentPassword: PASSWORD, newPassword, confirmPassword: newPassword });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.success, true);

  // The fresh session cookie issued by the setup call lets the same agent continue.
  const me = await agent.get('/api/v1/staff/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.mustChangePassword, false);
  assert.equal((await agent.get('/api/v1/staff/cases')).status, 200);

  // And the new password is the real one.
  await login(email, newPassword);
});

// ---------------------------------------------------------------------------
// A2 — cases directory
// ---------------------------------------------------------------------------

test('GET /staff/cases: items use id and the list is flat total/totalPages/page/pageSize; supports search and archived', async () => {
  await seedCase({ title: 'Alpha petition' });
  await seedCase({ title: 'Beta petition' });
  await seedCase({ title: 'Gamma archived', archived: true });
  const { agent } = await staffAgent('super_admin');

  const res = await agent.get('/api/v1/staff/cases?limit=1');
  assert.equal(res.status, 200);
  const { data } = res.body;
  assert.equal(data.total, 2);
  assert.equal(data.totalPages, 2);
  assert.equal(data.page, 1);
  assert.equal(data.pageSize, 1);
  assert.equal(data.pagination, undefined);
  const item = data.items[0];
  assert.ok(item.id);
  assert.equal(item._id, undefined);
  assert.equal(item.primaryClient.displayName, 'Casey Client');
  for (const key of ['caseNumber', 'title', 'caseType', 'currentStage', 'priority', 'targetFilingDate', 'archivedAt', 'updatedAt', 'projectManager']) {
    assert.ok(key in item, `missing ${key}`);
  }

  const searched = await agent.get('/api/v1/staff/cases?search=beta');
  assert.deepEqual(searched.body.data.items.map((c) => c.title), ['Beta petition']);

  // `q` and `includeArchived` are NOT supported parameters.
  assert.equal((await agent.get('/api/v1/staff/cases?q=beta')).body.data.total, 2);
  assert.equal((await agent.get('/api/v1/staff/cases?includeArchived=true')).body.data.total, 2);

  const archived = await agent.get('/api/v1/staff/cases?archived=true');
  assert.equal(archived.body.data.total, 3);
});

// ---------------------------------------------------------------------------
// A4 — action flags, not role names
// ---------------------------------------------------------------------------

test('GET /staff/cases/:id: actions flags follow capabilities, so a real pm member is not treated as read-only', async () => {
  const { caseDoc, workspace } = await seedCase();

  const pm = await staffAgent('pm', { workspace });
  const pmRes = await pm.agent.get(`/api/v1/staff/cases/${caseDoc._id}`);
  assert.equal(pmRes.status, 200);
  assert.equal(pmRes.body.data.workspaceId, String(workspace._id));
  assert.deepEqual(pmRes.body.data.actions, {
    canManageCase: true,
    canAssignManager: false, // cases.assign is admin-tier
    canArchive: false,
    canManageMembers: true,
    canPublishClientUpdate: true,
  });

  const admin = await staffAgent('super_admin');
  assert.deepEqual((await admin.agent.get(`/api/v1/staff/cases/${caseDoc._id}`)).body.data.actions, {
    canManageCase: true,
    canAssignManager: true,
    canArchive: true,
    canManageMembers: true,
    canPublishClientUpdate: true,
  });

  const reviewer = await staffAgent('reviewer', { workspace, workspaceRole: 'reviewer' });
  const reviewerRes = await reviewer.agent.get(`/api/v1/staff/cases/${caseDoc._id}`);
  assert.equal(reviewerRes.status, 200);
  assert.ok(Object.values(reviewerRes.body.data.actions).every((v) => v === false), 'reviewer gets no mutating actions');
  // The API never reports roles[]; Angular must not look for it.
  assert.equal(reviewerRes.body.data.team, undefined);
  assert.equal(reviewerRes.body.data.activities, undefined);
});

// ---------------------------------------------------------------------------
// A5 / A6 / A7 — team, activity, mutations
// ---------------------------------------------------------------------------

test('members and activity are served by their own endpoints with the DTO shapes Angular reads', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { workspace });
  await CaseActivity.record({ caseId: caseDoc._id, workspaceId: workspace._id, type: 'client_update_published', message: 'Published.', actor: { type: 'system', id: null, name: 'System' } });

  const members = await agent.get(`/api/v1/staff/cases/${caseDoc._id}/members`);
  assert.equal(members.status, 200);
  const list = members.body.data.members;
  assert.equal(list.length, 2);
  const employee = list.find((m) => m.memberType === 'employee');
  const client = list.find((m) => m.memberType === 'client');
  assert.ok(employee.id && employee.employee.id && employee.employee.name);
  assert.equal(employee.client, null);
  assert.equal(employee.workspaceRole, 'project_manager');
  assert.equal(client.client.displayName, 'Casey Client');
  assert.equal(client.employee, null);
  for (const key of ['status', 'clientVisible', 'joinedAt']) assert.ok(key in employee, `missing ${key}`);

  const activity = await agent.get(`/api/v1/staff/cases/${caseDoc._id}/activity?page=1&limit=20`);
  assert.equal(activity.status, 200);
  assert.equal(activity.body.data.total, 1);
  assert.equal(activity.body.data.totalPages, 1);
  assert.deepEqual(Object.keys(activity.body.data.items[0]).sort(), ['actorName', 'createdAt', 'id', 'message', 'meta', 'type']);
});

test('case mutations: Express payload fields are projectManagerId / adminUserId+workspaceRole; responses are compact and the canonical members endpoint reflects them', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('super_admin');
  const newPm = await AdminUser.create({ name: 'New PM', email: `${unique('npm')}@ih.test`, password: PASSWORD, role: 'pm', isActive: true });
  const helper = await AdminUser.create({ name: 'Helper', email: `${unique('helper')}@ih.test`, password: PASSWORD, role: 'reviewer', isActive: true });
  const base = `/api/v1/staff/cases/${caseDoc._id}`;

  // member-options carries id (not _id) so the PM / member pickers can bind it
  const options = await agent.get(`${base}/member-options`);
  assert.equal(options.status, 200);
  assert.ok(options.body.data.employees.every((e) => e.id && e._id === undefined));

  // The pre-fix Angular payload is rejected.
  const legacy = await agent.patch(`${base}/project-manager`).set('Origin', ORIGIN).send({ employeeId: String(newPm._id) });
  assert.equal(legacy.status, 400);

  const pmRes = await agent.patch(`${base}/project-manager`).set('Origin', ORIGIN).send({ projectManagerId: String(newPm._id) });
  assert.equal(pmRes.status, 200);
  assert.deepEqual(Object.keys(pmRes.body.data).sort(), ['caseId', 'outcome'], 'compact result, not the case DTO');

  const stageRes = await agent.patch(`${base}/stage`).set('Origin', ORIGIN).send({ stage: 'drafting' });
  assert.equal(stageRes.status, 200);
  assert.deepEqual(Object.keys(stageRes.body.data).sort(), ['caseId', 'outcome', 'stage']);

  // Roles the Angular picker used to offer are not workspace roles.
  for (const workspaceRole of ['lead', 'viewer', 'project_manager', 'client']) {
    const bad = await agent.post(`${base}/members`).set('Origin', ORIGIN).send({ adminUserId: String(helper._id), workspaceRole, clientVisible: true });
    assert.equal(bad.status, 422, `${workspaceRole} must be rejected, not 500`);
  }
  const legacyAdd = await agent.post(`${base}/members`).set('Origin', ORIGIN).send({ employeeId: String(helper._id), role: 'contributor' });
  assert.equal(legacyAdd.status, 400);

  const added = await agent.post(`${base}/members`).set('Origin', ORIGIN).send({ adminUserId: String(helper._id), workspaceRole: 'reviewer', clientVisible: true });
  assert.equal(added.status, 201);
  assert.deepEqual(Object.keys(added.body.data).sort(), ['memberId', 'outcome']);

  const members = (await agent.get(`${base}/members`)).body.data.members;
  const helperMember = members.find((m) => m.employee?.id === String(helper._id));
  assert.equal(helperMember.workspaceRole, 'reviewer');
  assert.equal(helperMember.id, added.body.data.memberId);
  assert.ok(members.some((m) => m.employee?.id === String(newPm._id) && m.workspaceRole === 'project_manager'));

  const detail = (await agent.get(base)).body.data;
  assert.equal(detail.currentStage, 'drafting');
  assert.equal(detail.projectManager.id, String(newPm._id));

  const removed = await agent.delete(`${base}/members/${helperMember.id}`).set('Origin', ORIGIN);
  assert.equal(removed.status, 200);
  const after = (await agent.get(`${base}/members`)).body.data.members;
  assert.ok(!after.some((m) => m.employee?.id === String(helper._id) && m.status !== 'removed'));
});

test('member-options is concealed from members who can neither add members nor assign a PM', async () => {
  const { caseDoc, workspace } = await seedCase();
  const reviewer = await staffAgent('reviewer', { workspace, workspaceRole: 'reviewer' });
  const res = await reviewer.agent.get(`/api/v1/staff/cases/${caseDoc._id}/member-options`);
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// A3 — clients
// ---------------------------------------------------------------------------

test('clients list/detail: search param, flat pagination, displayName, cases[].id, canonical statuses, no portalStatus', async () => {
  const { client, caseDoc } = await seedCase();
  const { agent } = await staffAgent('super_admin');

  const list = await agent.get('/api/v1/staff/clients?search=casey');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.totalPages, 1);
  assert.equal(list.body.data.pagination, undefined);
  assert.equal(list.body.data.items[0].displayName, 'Casey Client');
  assert.equal((await agent.get('/api/v1/staff/clients?q=casey')).body.data.total, 1, 'q is ignored, not a filter');
  assert.equal((await agent.get('/api/v1/staff/clients?search=nobody')).body.data.total, 0);

  for (const status of ['pending', 'active', 'locked', 'disabled']) {
    assert.equal((await agent.get(`/api/v1/staff/clients?status=${status}`)).status, 200);
  }
  assert.equal((await agent.get('/api/v1/staff/clients?status=active')).body.data.total, 1);
  assert.equal((await agent.get('/api/v1/staff/clients?status=pending_initial_setup')).body.data.total, 0);

  const detail = await agent.get(`/api/v1/staff/clients/${client._id}`);
  assert.equal(detail.status, 200);
  const d = detail.body.data;
  assert.equal(d.displayName, 'Casey Client');
  assert.equal(d.name, undefined);
  assert.equal(d.portalStatus, undefined);
  assert.equal(d.passwordHash, undefined);
  assert.equal(d.cases[0].id, String(caseDoc._id));
  assert.equal(d.cases[0]._id, undefined);
});

// ---------------------------------------------------------------------------
// A8 — dashboard
// ---------------------------------------------------------------------------

test('GET /staff/dashboard: recentCases and myTasks are serialized with id, not raw documents', async () => {
  const { caseDoc } = await seedCase();
  const { agent, user } = await staffAgent('super_admin');
  const Task = require('../../models/admin/Task');
  await Task.create({ title: 'Do the thing', assignee: user._id, createdBy: user._id });

  const res = await agent.get('/api/v1/staff/dashboard');
  assert.equal(res.status, 200);
  const { recentCases, myTasks } = res.body.data;
  assert.equal(recentCases[0].id, String(caseDoc._id));
  assert.equal(recentCases[0]._id, undefined);
  assert.equal(recentCases[0].__v, undefined);
  assert.equal(myTasks[0].title, 'Do the thing');
  assert.ok(myTasks[0].id);
  assert.equal(myTasks[0]._id, undefined);
});
