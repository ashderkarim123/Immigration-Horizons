process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');

const { createApp } = require('../../app');
const Consultation = require('../../models/Consultation');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const CaseActivity = require('../../models/CaseActivity');
const ClientUser = require('../../models/ClientUser');
const ActivityLog = require('../../models/admin/ActivityLog');

let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
});

test.after(async () => {
  await stopTestDb();
});

test.beforeEach(async () => {
  await clearCollections();
});

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return { agent, user: creds.user };
}

let clientEmailCounter = 0;
function uniqueClientEmail() {
  clientEmailCounter += 1;
  return `client-${Date.now()}-${clientEmailCounter}@example.com`;
}

async function seedActiveClient(overrides = {}) {
  const email = overrides.email || uniqueClientEmail();
  return ClientUser.create({
    status: 'active',
    ...overrides,
    email,
    normalizedEmail: email,
    passwordHash: 'irrelevant',
  });
}

async function seedLead(overrides = {}) {
  return Consultation.create({
    name: 'Case Lead',
    email: 'caselead@example.com',
    message: 'Please assess my eligibility for this category.',
    service: 'EB-2 NIW',
    ...overrides,
  });
}

function convertBody(overrides = {}) {
  return {
    title: 'Test Case',
    caseType: 'eb2_niw',
    priority: 'medium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Conversion — happy path and provisioning correctness
// ---------------------------------------------------------------------------

test('conversion: an authorized manager (pm) converts a consultation with an active client', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const client = await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id });

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));

  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/admin\/cases\//);

  const caseDoc = await ClientCase.findOne({ consultation: lead._id });
  assert.ok(caseDoc, 'a case must be created');
  assert.equal(caseDoc.caseType, 'eb2_niw');
  assert.equal(String(caseDoc.primaryClient), String(client._id));
  assert.equal(String(caseDoc.projectManager), String(pm._id));
  assert.equal(caseDoc.currentStage, 'intake');

  const workspaces = await CaseWorkspace.find({ case: caseDoc._id });
  assert.equal(workspaces.length, 1, 'exactly one primary workspace');
  assert.equal(workspaces[0].workspaceType, 'primary');

  const members = await WorkspaceMember.find({ workspace: workspaces[0]._id });
  const clientMember = members.find((m) => m.memberType === 'client');
  const pmMember = members.find((m) => m.memberType === 'employee');
  assert.equal(clientMember.status, 'active', 'active client -> active membership');
  assert.equal(String(clientMember.clientUser), String(client._id));
  assert.equal(pmMember.status, 'active');
  assert.equal(pmMember.workspaceRole, 'project_manager');

  const updatedLead = await Consultation.findById(lead._id);
  assert.equal(String(updatedLead.convertedCase), String(caseDoc._id));
  assert.ok(updatedLead.convertedAt);

  const caseActivities = await CaseActivity.find({ case: caseDoc._id });
  assert.ok(caseActivities.some((a) => a.type === 'case_created'));
  assert.ok(caseActivities.some((a) => a.type === 'workspace_created'));

  const leadActivity = await ActivityLog.findOne({ lead: lead._id, type: 'case_converted' });
  assert.ok(leadActivity, 'the originating lead gets a case_converted activity entry');
  assert.equal(leadActivity.meta.caseNumber, caseDoc.caseNumber);
});

test('conversion: a pending client gets an invited (not active) membership', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const client = await seedActiveClient({ email: 'pending@example.com', status: 'pending' });
  const lead = await seedLead({ clientUser: client._id, email: 'pending@example.com' });

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));

  assert.equal(res.status, 302);
  const caseDoc = await ClientCase.findOne({ consultation: lead._id });
  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id });
  const clientMember = await WorkspaceMember.findOne({ workspace: workspace._id, memberType: 'client' });
  assert.equal(clientMember.status, 'invited');
});

test('conversion: a consultation with no linked client is rejected with a controlled validation error, no case created', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const lead = await seedLead();

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));

  assert.equal(res.status, 302); // redirected back to the lead detail page
  assert.equal(await ClientCase.countDocuments({}), 0);
  const updatedLead = await Consultation.findById(lead._id);
  assert.equal(updatedLead.convertedCase, null);
});

test('conversion: an invalid project manager id is rejected', async () => {
  const { agent } = await loggedInAs('pm');
  const client = await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id });

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: '507f1f77bcf86cd799439011' }));

  assert.equal(res.status, 302);
  assert.equal(await ClientCase.countDocuments({}), 0);
});

test('conversion: a disabled (isActive: false) employee cannot be selected as project manager', async () => {
  const { agent } = await loggedInAs('pm');
  const disabled = await seedAdminUser({ role: 'pm', isActive: false });
  const client = await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id });

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(disabled.user._id) }));

  assert.equal(res.status, 302);
  assert.equal(await ClientCase.countDocuments({}), 0);
});

test('conversion: viewer cannot convert a lead to a case', async () => {
  const { agent, user: pm } = await loggedInAs('viewer');
  const client = await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id });

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));

  assert.equal(res.status, 403);
  assert.equal(await ClientCase.countDocuments({}), 0);
});

test('conversion: an unauthorized specialist (reviewer, no cases.create) cannot convert', async () => {
  const { agent } = await loggedInAs('reviewer');
  const { user: pm } = await loggedInAs('pm'); // just to get a valid pm id, unrelated session
  const client = await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id });

  const res = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));

  assert.equal(res.status, 403);
  assert.equal(await ClientCase.countDocuments({}), 0);
});

test('conversion: a duplicate conversion attempt creates no additional case, workspace, or memberships', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const client = await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id });

  const first = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));
  const second = await agent
    .post(`/admin/leads/${lead._id}/convert-to-case`)
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id), title: 'Different Title' }));

  assert.equal(first.status, 302);
  assert.equal(second.status, 302);
  assert.equal(first.headers.location, second.headers.location, 'both point at the same case');

  assert.equal(await ClientCase.countDocuments({ consultation: lead._id }), 1);
  assert.equal(await CaseWorkspace.countDocuments({}), 1);
  const caseDoc = await ClientCase.findOne({ consultation: lead._id });
  assert.equal(caseDoc.title, 'Test Case', 'the second attempt must not overwrite the first case');
});

test('conversion: invalid consultation id returns a controlled 404, not a 500', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const res = await agent
    .post('/admin/leads/not-a-valid-object-id/convert-to-case')
    .type('form')
    .send(convertBody({ projectManagerId: String(pm._id) }));
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Membership management
// ---------------------------------------------------------------------------

async function convertedCase(pmId, clientId) {
  const client = clientId ? await ClientUser.findById(clientId) : await seedActiveClient();
  const lead = await seedLead({ clientUser: client._id, email: client.email });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Existing Case',
    caseType: 'eb2_niw',
    consultation: lead._id,
    primaryClient: client._id,
    projectManager: pmId,
    createdByName: 'Test Setup',
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: 'primary',
    name: 'Primary Workspace',
  });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: 'active',
    joinedAt: new Date(),
  });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pmId,
    workspaceRole: 'project_manager',
    status: 'active',
    joinedAt: new Date(),
  });
  return { caseDoc, workspace, client, lead };
}

test('membership: a manager adds an employee member', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { caseDoc } = await convertedCase(pm._id);
  const { user: specialist } = await seedAdminUser({ role: 'petition_writer' });

  const res = await agent
    .post(`/admin/cases/${caseDoc._id}/members`)
    .type('form')
    .send({ memberType: 'employee', adminUserId: String(specialist._id), workspaceRole: 'contributor' });

  assert.equal(res.status, 302);
  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id });
  const member = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: specialist._id });
  assert.ok(member);
  assert.equal(member.status, 'active');
});

test('membership: adding the same employee twice does not create a duplicate row', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { caseDoc, workspace } = await convertedCase(pm._id);
  const { user: specialist } = await seedAdminUser({ role: 'petition_writer' });

  const body = { memberType: 'employee', adminUserId: String(specialist._id), workspaceRole: 'contributor' };
  await agent.post(`/admin/cases/${caseDoc._id}/members`).type('form').send(body);
  await agent.post(`/admin/cases/${caseDoc._id}/members`).type('form').send(body);

  assert.equal(
    await WorkspaceMember.countDocuments({ workspace: workspace._id, adminUser: specialist._id }),
    1,
  );
});

test('membership: a removed member can be safely reactivated', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { caseDoc, workspace } = await convertedCase(pm._id);
  const { user: specialist } = await seedAdminUser({ role: 'petition_writer' });

  const body = { memberType: 'employee', adminUserId: String(specialist._id), workspaceRole: 'contributor' };
  await agent.post(`/admin/cases/${caseDoc._id}/members`).type('form').send(body);
  const member = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: specialist._id });

  await agent.post(`/admin/cases/${caseDoc._id}/members/${member._id}?_method=DELETE`).type('form').send({});
  const removed = await WorkspaceMember.findById(member._id);
  assert.equal(removed.status, 'removed');
  assert.ok(removed.removedAt);

  await agent.post(`/admin/cases/${caseDoc._id}/members`).type('form').send(body);
  const reactivated = await WorkspaceMember.findById(member._id);
  assert.equal(reactivated.status, 'active');
  assert.equal(reactivated.removedAt, null);
  assert.equal(
    await WorkspaceMember.countDocuments({ workspace: workspace._id, adminUser: specialist._id }),
    1,
    'reactivation must not create a second row',
  );
});

test('membership: unauthorized member management is rejected', async () => {
  const { user: pm } = await loggedInAs('pm');
  const { caseDoc } = await convertedCase(pm._id);
  const { agent } = await loggedInAs('viewer');
  const { user: specialist } = await seedAdminUser({ role: 'petition_writer' });

  const res = await agent
    .post(`/admin/cases/${caseDoc._id}/members`)
    .type('form')
    .send({ memberType: 'employee', adminUserId: String(specialist._id) });

  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Project manager change, stage update, archive
// ---------------------------------------------------------------------------

test('project manager change updates both the case and the membership roles', async () => {
  const { agent, user: pm } = await loggedInAs('admin');
  const { user: originalPm } = await seedAdminUser({ role: 'pm' });
  const { caseDoc, workspace } = await convertedCase(originalPm._id);

  const res = await agent
    .post(`/admin/cases/${caseDoc._id}/manager`)
    .type('form')
    .send({ projectManagerId: String(pm._id) });

  assert.equal(res.status, 302);
  const updatedCase = await ClientCase.findById(caseDoc._id);
  assert.equal(String(updatedCase.projectManager), String(pm._id));

  const newPmMember = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: pm._id });
  assert.equal(newPmMember.workspaceRole, 'project_manager');
  assert.equal(newPmMember.status, 'active');

  const oldPmMember = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: originalPm._id });
  assert.equal(oldPmMember.workspaceRole, 'contributor', 'former PM keeps case access, demoted to contributor');
});

test('stage update validates the destination and audits the change', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { caseDoc } = await convertedCase(pm._id);

  const invalid = await agent.post(`/admin/cases/${caseDoc._id}/stage`).type('form').send({ stage: 'not-a-real-stage' });
  assert.equal(invalid.status, 302);
  assert.equal((await ClientCase.findById(caseDoc._id)).currentStage, 'intake', 'invalid stage must not apply');

  const valid = await agent.post(`/admin/cases/${caseDoc._id}/stage`).type('form').send({ stage: 'strategy' });
  assert.equal(valid.status, 302);
  assert.equal((await ClientCase.findById(caseDoc._id)).currentStage, 'strategy');

  const activities = await CaseActivity.find({ case: caseDoc._id, type: 'stage_changed' });
  assert.equal(activities.length, 1);
  assert.equal(activities[0].meta.previousStage, 'intake');
  assert.equal(activities[0].meta.newStage, 'strategy');
});

test('archive is non-destructive: the case, workspace, and memberships all survive', async () => {
  const { agent, user: pm } = await loggedInAs('admin');
  const { user: casePm } = await seedAdminUser({ role: 'pm' });
  const { caseDoc, workspace } = await convertedCase(casePm._id);
  void pm;

  const res = await agent.post(`/admin/cases/${caseDoc._id}/archive`).type('form').send({});
  assert.equal(res.status, 302);

  const archived = await ClientCase.findById(caseDoc._id);
  assert.ok(archived, 'case document still exists');
  assert.ok(archived.archivedAt);
  assert.equal(archived.status, 'archived');
  assert.equal(archived.currentStage, 'archived');

  assert.ok(await CaseWorkspace.findById(workspace._id), 'workspace still exists');
  assert.equal(await WorkspaceMember.countDocuments({ workspace: workspace._id }), 2, 'memberships untouched');
});

test('a case detail request with an invalid id returns a controlled response, not a 500', async () => {
  const { agent } = await loggedInAs('admin');
  const res = await agent.get('/admin/cases/not-a-valid-object-id');
  assert.notEqual(res.status, 500);
});

// ---------------------------------------------------------------------------
// Row-level view authorization
// ---------------------------------------------------------------------------

test('an employee with cases.view but no workspace membership cannot see a case they are not a member of', async () => {
  const { user: casePm } = await seedAdminUser({ role: 'pm' });
  const { caseDoc } = await convertedCase(casePm._id);
  const { agent } = await loggedInAs('pm'); // a different pm, no membership on this case

  const res = await agent.get(`/admin/cases/${caseDoc._id}`);
  assert.equal(res.status, 403);
});

test('cases.view_all (admin) can view a case without any workspace membership', async () => {
  const { user: casePm } = await seedAdminUser({ role: 'pm' });
  const { caseDoc } = await convertedCase(casePm._id);
  const { agent } = await loggedInAs('admin');

  const res = await agent.get(`/admin/cases/${caseDoc._id}`);
  assert.equal(res.status, 200);
});

test('the assigned project manager can view their own case', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { caseDoc } = await convertedCase(pm._id);

  const res = await agent.get(`/admin/cases/${caseDoc._id}`);
  assert.equal(res.status, 200);
});

test('cases list only shows cases the pm has active membership for, unless cases.view_all', async () => {
  const { agent: pmAgent, user: pm } = await loggedInAs('pm');
  const { user: otherPm } = await seedAdminUser({ role: 'pm' });
  const mine = await convertedCase(pm._id);
  const notMine = await convertedCase(otherPm._id);

  const res = await pmAgent.get('/admin/cases');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes(mine.caseDoc.caseNumber));
  assert.ok(!res.text.includes(notMine.caseDoc.caseNumber));
});
