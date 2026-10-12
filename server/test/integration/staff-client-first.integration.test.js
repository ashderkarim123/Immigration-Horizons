/**
 * Client-first workspace: staff recognise a matter by the client's name, so every Staff DTO that points at a case
 * carries `clientName`, and the dashboard answers "who are my clients, what is next, what is late" from real rows.
 * Pins the fields the Angular dashboard depends on and that none of it widens what an employee may see.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const CaseActivity = require('../../models/CaseActivity');
const DocumentRequest = require('../../models/DocumentRequest');
const Task = require('../../models/admin/Task');
const { addClientNames } = require('../../services/caseRef');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const DAY = 86400000;

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function staff(role, name = `Staff ${role}`) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD });
  assert.equal(res.status, 200);
  return { agent, user };
}

async function seedCase({ firstName, lastName, title, caseType = 'eb2_niw', manager, members = [], updatedAt = null }) {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName, lastName, status: 'active' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title, caseType, primaryClient: client._id, projectManager: manager._id, createdBy: manager._id, createdByName: manager.name, currentStage: 'drafting',
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: manager._id, createdByName: manager.name });
  const clientMember = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  for (const [user, workspaceRole] of [[manager, 'project_manager'], ...members]) {
    await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole, status: 'active' });
  }
  if (updatedAt) await ClientCase.collection.updateOne({ _id: caseDoc._id }, { $set: { updatedAt } });
  return { client, caseDoc, workspace, clientMember };
}

test('dashboard: a case is a client first — name, service, stage, owner, next action and what is pending; the number is a reference', async () => {
  const pm = await staff('pm', 'Sarah Manager');
  const { caseDoc, workspace, client, clientMember } = await seedCase({ firstName: 'John', lastName: 'Smith', title: 'NIW petition', manager: pm.user });
  await Task.create({ title: 'Later task', case: caseDoc._id, assignee: pm.user._id, dueDate: new Date(Date.now() + 5 * DAY), createdBy: 'x' });
  const next = await Task.create({ title: 'Review employment letters', case: caseDoc._id, assignee: pm.user._id, dueDate: new Date(Date.now() + 2 * DAY), createdBy: 'x' });
  await Task.create({ title: 'Undated task', case: caseDoc._id, assignee: pm.user._id, createdBy: 'x' });
  await Task.create({ title: 'Done already', case: caseDoc._id, assignee: pm.user._id, status: 'completed', dueDate: new Date(Date.now() - DAY), createdBy: 'x' });
  await DocumentRequest.create({ case: caseDoc._id, workspace: workspace._id, category: new mongoose.Types.ObjectId(), title: 'Passport', requestedFrom: clientMember._id, requestedBy: pm.user._id });
  await CaseActivity.create({ case: caseDoc._id, workspace: workspace._id, type: 'document_requested', message: 'Requested "Passport" from the client.', actorName: 'Sarah Manager' });
  await CaseActivity.create({ case: caseDoc._id, workspace: workspace._id, type: 'category_provisioned', message: 'Default categories created.', actorName: 'System' });

  const res = await pm.agent.get('/api/v1/staff/dashboard');
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.scope, 'mine');
  assert.equal(d.activeClients, 1);
  assert.equal(d.myCases, 1);
  assert.equal(d.newAssignedCases, 1);
  assert.equal(d.casesAwaitingClientDocuments, 1);
  assert.equal(d.recentCases, undefined);

  assert.equal(d.clientCases.length, 1);
  const row = d.clientCases[0];
  assert.deepEqual(Object.keys(row).sort(), ['caseNumber', 'caseType', 'client', 'currentStage', 'id', 'nextAction', 'pending', 'priority', 'projectManager', 'targetFilingDate', 'title', 'updatedAt']);
  assert.deepEqual(row.client, { id: String(client._id), name: 'John Smith' });
  assert.equal(row.caseNumber, caseDoc.caseNumber);
  assert.equal(row.caseType, 'eb2_niw');
  assert.equal(row.currentStage, 'drafting');
  assert.equal(row.projectManager.name, 'Sarah Manager');
  // the soonest dated open task, not an undated or completed one
  assert.equal(row.nextAction.taskId, String(next._id));
  assert.equal(row.nextAction.title, 'Review employment letters');
  assert.equal(row.nextAction.assignee, 'Sarah Manager');
  assert.deepEqual(row.pending, { openTasks: 3, documentRequests: 1 });

  // my tasks: dated first, each naming the client, with the server's own action flags
  assert.deepEqual(d.myTasks.map((t) => t.title), ['Review employment letters', 'Later task', 'Undated task']);
  assert.equal(d.myTasks[0].case.clientName, 'John Smith');
  assert.equal(d.myTasks[0].case.caseType, 'eb2_niw');
  assert.equal(d.myTasks[0].actions.canChangeStatus, true);
  assert.equal(d.myTasks[0]._id, undefined);

  // activity names the client and leaves housekeeping out
  assert.equal(d.recentActivity.length, 1);
  assert.equal(d.recentActivity[0].message, 'Requested "Passport" from the client.');
  assert.equal(d.recentActivity[0].case.clientName, 'John Smith');
  assert.equal(d.recentActivity[0].case.id, String(caseDoc._id));

  // the attention queues name the client too
  const waiting = d.workQueues.find((q) => q.key === 'requested_documents');
  assert.equal(waiting.items[0].clientName, 'John Smith');
});

test('dashboard: an employee sees only their own cases, clients and activity; an administrator sees the firm', async () => {
  const pm = await staff('pm', 'Sarah Manager');
  const other = await staff('pm', 'Omar Manager');
  const writer = await staff('petition_writer', 'Wendy Writer');
  const mine = await seedCase({ firstName: 'John', lastName: 'Smith', title: 'NIW petition', manager: pm.user, members: [[writer.user, 'contributor']] });
  const theirs = await seedCase({ firstName: 'Maria', lastName: 'Garcia', title: 'O-1 petition', caseType: 'o1', manager: other.user });
  await CaseActivity.create({ case: theirs.caseDoc._id, type: 'stage_changed', message: 'Stage changed to drafting.', actorName: 'Omar Manager' });
  await Task.create({ title: 'Their task', case: theirs.caseDoc._id, assignee: other.user._id, createdBy: 'x' });

  const own = (await pm.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.deepEqual(own.clientCases.map((c) => c.client.name), ['John Smith']);
  assert.equal(own.activeClients, 1);
  assert.equal(JSON.stringify(own).includes('Garcia'), false);
  assert.equal(JSON.stringify(own).includes('Stage changed'), false);

  // a specialist on the case sees the client's name (the case shows it) but gets no link into client records
  const spec = (await writer.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.deepEqual(spec.clientCases.map((c) => c.client), [{ id: null, name: 'John Smith' }]);
  assert.equal(spec.casesAwaitingClientDocuments, null);
  assert.equal(JSON.stringify(spec).includes('Garcia'), false);

  const admin = await staff('super_admin', 'Ada Admin');
  const firm = (await admin.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.equal(firm.scope, 'organization');
  assert.equal(firm.activeClients, 2);
  assert.deepEqual(firm.clientCases.map((c) => c.client.name).sort(), ['John Smith', 'Maria Garcia']);
  assert.equal(firm.newAssignedCases, 0);
  assert.equal(mine.caseDoc.caseType, 'eb2_niw');
});

test('one client with two matters is counted once, and each matter is listed under the same client', async () => {
  const pm = await staff('pm', 'Sarah Manager');
  const first = await seedCase({ firstName: 'John', lastName: 'Smith', title: 'NIW petition', manager: pm.user });
  const second = await ClientCase.create({ caseNumber: 'IH-2026-SECOND', title: 'RFE response', caseType: 'rfe_response', primaryClient: first.client._id, projectManager: pm.user._id, createdByName: 'x' });
  const ws = await CaseWorkspace.create({ case: second._id, workspaceType: 'primary', name: 'WS2', createdBy: pm.user._id, createdByName: 'x' });
  await WorkspaceMember.create({ workspace: ws._id, memberType: 'employee', adminUser: pm.user._id, workspaceRole: 'project_manager', status: 'active' });

  const d = (await pm.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.equal(d.activeClients, 1);
  assert.equal(d.myCases, 2);
  assert.deepEqual(d.clientCases.map((c) => c.client.id), [String(first.client._id), String(first.client._id)]);
  assert.deepEqual(d.clientCases.map((c) => c.caseType).sort(), ['eb2_niw', 'rfe_response']);
});

test('the case list is found by the client\'s name, in part or in full, and never beyond the employee\'s own cases', async () => {
  const pm = await staff('pm', 'Sarah Manager');
  const other = await staff('pm', 'Omar Manager');
  const mine = await seedCase({ firstName: 'John', lastName: 'Smith', title: 'NIW petition', manager: pm.user });
  await seedCase({ firstName: 'Johnny', lastName: 'Walker', title: 'O-1 petition', manager: other.user });

  for (const q of ['smith', 'John Smith', 'john']) {
    const res = await pm.agent.get('/api/v1/staff/cases').query({ search: q });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.items.map((c) => c.id), [String(mine.caseDoc._id)], `search "${q}"`);
    assert.equal(res.body.data.items[0].primaryClient.displayName, 'John Smith');
  }
  assert.equal((await pm.agent.get('/api/v1/staff/cases').query({ search: 'Walker' })).body.data.total, 0);
  assert.equal((await pm.agent.get('/api/v1/staff/cases').query({ search: '.*' })).body.data.total, 0); // a pattern is text, not a regex
});

test('tasks, deadlines, the work queue page and search results all carry the client\'s name with the case', async () => {
  const pm = await staff('pm', 'Sarah Manager');
  const { caseDoc } = await seedCase({ firstName: 'John', lastName: 'Smith', title: 'NIW petition', manager: pm.user });
  const today = new Date(); today.setUTCHours(12, 0, 0, 0);
  const task = await Task.create({ title: 'Call the client', case: caseDoc._id, assignee: pm.user._id, dueDate: today, createdBy: 'x' });
  await Task.create({ title: 'Next week', case: caseDoc._id, assignee: pm.user._id, dueDate: new Date(Date.now() + 9 * DAY), createdBy: 'x' });

  const list = await pm.agent.get('/api/v1/staff/tasks');
  assert.deepEqual(list.body.data.items[0].case, { id: String(caseDoc._id), caseNumber: caseDoc.caseNumber, title: 'NIW petition', clientName: 'John Smith', caseType: 'eb2_niw' });
  assert.equal((await pm.agent.get(`/api/v1/staff/tasks/${task._id}`)).body.data.case.clientName, 'John Smith');

  // "due today" is the list behind the dashboard card, so the two agree
  const dueToday = await pm.agent.get('/api/v1/staff/tasks').query({ due: 'today' });
  assert.deepEqual(dueToday.body.data.items.map((t) => t.title), ['Call the client']);
  assert.equal((await pm.agent.get('/api/v1/staff/dashboard')).body.data.tasksDueToday, 1);

  const deadlines = await pm.agent.get('/api/v1/staff/deadlines');
  assert.ok(deadlines.body.data.deadlines.length >= 2);
  assert.ok(deadlines.body.data.deadlines.every((d) => d.case.clientName === 'John Smith'));

  const queue = await pm.agent.get('/api/v1/staff/work-queues').query({ queue: 'assigned_tasks' });
  assert.equal(queue.body.data.items[0].clientName, 'John Smith');
  assert.equal(queue.body.data.items[0].caseType, 'eb2_niw');

  const search = await pm.agent.get('/api/v1/staff/search').query({ q: 'Call the client' });
  assert.equal(search.status, 200);
  const hit = search.body.data.groups.find((g) => g.type === 'tasks').items[0];
  assert.equal(hit.case.clientName, 'John Smith');
});

test('addClientNames: one lookup, tolerant of missing references and of a case that no longer exists', async () => {
  const pm = await staff('pm');
  const { caseDoc } = await seedCase({ firstName: '', lastName: '', title: 'No name on file', manager: pm.user });
  const refs = [{ id: String(caseDoc._id) }, null, { id: String(new mongoose.Types.ObjectId()) }];
  await addClientNames(refs);
  assert.match(refs[0].clientName, /@example\.com$/); // no name on the account: the email stands in
  assert.equal(refs[2].clientName, '');
  assert.equal(refs[2].caseType, null);
  assert.deepEqual(await addClientNames([null]), [null]);
});
