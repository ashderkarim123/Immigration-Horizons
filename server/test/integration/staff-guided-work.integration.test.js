process.env.LOGIN_RATE_LIMIT = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginStaffAs } = require('../helpers/auth');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const DocumentCategory = require('../../models/DocumentCategory');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const Consultation = require('../../models/Consultation');
const Task = require('../../models/admin/Task');
const CaseSmartForm = require('../../models/CaseSmartForm');
const mongoose = require('mongoose');
const CaseActivity = require('../../models/CaseActivity');
const ORIGIN = 'http://localhost:4000';
let app; let sequence = 0;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb); test.beforeEach(clearCollections);
async function staff(role) {
  const credentials = await seedAdminUser({ role });
  return { user: credentials.user, agent: await loginStaffAs(request.agent(app), credentials) };
}
async function client() {
  const email = `guided-${Date.now()}-${++sequence}@ih.test`;
  return ClientUser.create({ email, normalizedEmail: email, firstName: 'Guided', lastName: 'Client', passwordHash: 'x', status: 'active' });
}
function create(agent, body) { return agent.post('/api/v1/staff/case-intake').set('Origin', ORIGIN).send(body); }

test('operations creates a case with its primary workspace, required memberships, categories and channels', async () => {
  const operations = await staff('operations_admin'); const pm = await staff('pm'); const customer = await client();
  const response = await create(operations.agent, { clientId: String(customer._id), projectManagerId: String(pm.user._id), title: 'Guided case', caseType: 'eb2_niw' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const caseDoc = await ClientCase.findById(response.body.data.id);
  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: 'primary' });
  assert.ok(workspace);
  assert.equal(await CaseWorkspace.countDocuments({ case: caseDoc._id }), 1);
  assert.equal(await WorkspaceMember.countDocuments({ workspace: workspace._id, status: 'active' }), 2);
  assert.ok(await WorkspaceMember.exists({ workspace: workspace._id, adminUser: pm.user._id, workspaceRole: 'project_manager' }));
  assert.ok(await WorkspaceMember.exists({ workspace: workspace._id, clientUser: customer._id, workspaceRole: 'client' }));
  assert.ok(await DocumentCategory.exists({ case: caseDoc._id, templateKey: 'business_financial_records' }));
  assert.ok(await WorkspaceChannel.exists({ case: caseDoc._id }));
  assert.equal((await pm.agent.get(`/api/v1/staff/cases/${caseDoc._id}`)).status, 200);
});

test('PM creation is self-assigned and client/consultation choices remain scoped', async () => {
  const pm = await staff('pm'); const other = await staff('pm'); const customer = await client();
  const lead = await Consultation.create({ name: 'Owned lead', email: customer.email, clientUser: customer._id, owner: pm.user._id, message: 'Inquiry', service: 'EB-2 NIW' });
  const options = await pm.agent.get('/api/v1/staff/case-intake');
  assert.deepEqual(options.body.data.managers.map(manager => manager.id), [String(pm.user._id)]);
  const body = { consultationId: String(lead._id), projectManagerId: String(pm.user._id), title: 'Scoped conversion', caseType: 'eb2_niw' };
  assert.equal((await create(other.agent, { ...body, projectManagerId: String(other.user._id) })).status, 404);
  assert.equal((await create(pm.agent, { ...body, projectManagerId: String(other.user._id) })).status, 403);
  assert.equal((await create(pm.agent, body)).status, 201);
  const stranger = await client();
  assert.equal((await create(pm.agent, { ...body, consultationId: null, clientId: String(stranger._id) })).status, 404);
  assert.equal(await ClientCase.countDocuments({}), 1);
});

test('specialist/reviewer cannot create cases; unrecognized stages are absent from the catalog', async () => {
  for (const role of ['petition_writer', 'reviewer', 'editor', 'viewer']) {
    const actor = await staff(role);
    assert.equal((await actor.agent.get('/api/v1/staff/case-intake')).status, 403);
    assert.equal((await create(actor.agent, {})).status, 403);
  }
  const pm = await staff('pm');
  const catalog = (await pm.agent.get('/api/v1/staff/catalog')).body.data;
  assert.ok(catalog.caseStages.some(stage => stage.value === 'strategy'));
  assert.ok(!catalog.caseStages.some(stage => ['initial_review', 'decision_received', 'completed'].includes(stage.value)));
});

test('queues, case overview, and dashboard task counts all revoke access on membership removal', async () => {
  const operations = await staff('operations_admin'); const pm = await staff('pm'); const reviewer = await staff('reviewer'); const customer = await client();
  const response = await create(operations.agent, { clientId: String(customer._id), projectManagerId: String(pm.user._id), title: 'Private queue case', caseType: 'other' });
  const caseId = response.body.data.id; const workspace = await CaseWorkspace.findOne({ case: caseId });
  await WorkspaceMember.create({ workspace: workspace._id, adminUser: reviewer.user._id, memberType: 'employee', workspaceRole: 'reviewer', status: 'active' });
  await Task.create({ case: caseId, title: 'Sensitive task', type: 'Other', assignee: pm.user._id, status: 'todo', dueDate: new Date(Date.now() - 86400000), createdByName: 'QA' });
  await CaseSmartForm.create({ case: caseId, workspace: workspace._id, template: new mongoose.Types.ObjectId(), templateKey: 'qa', templateVersion: 1, templateTitleSnapshot: 'Review me', status: 'submitted' });
  const review = (await reviewer.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.equal(review.workspaceLabel, 'Review queue');
  assert.equal(review.workQueues.find(queue => queue.key === 'forms_review').count, 1);
  assert.ok(!review.workQueues.some(queue => queue.key === 'document_review'));
  assert.equal((await pm.agent.get('/api/v1/staff/dashboard')).body.data.myOpenTasks, 1);
  const firm = (await operations.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.deepEqual(firm.employeeWorkload, [{ employeeId: String(pm.user._id), name: pm.user.name, openTasks: 1, overdueTasks: 1 }]);
  assert.deepEqual((await pm.agent.get('/api/v1/staff/dashboard')).body.data.employeeWorkload, []);
  const scopedTasks = await operations.agent.get(`/api/v1/staff/tasks?scope=all&assignee=${pm.user._id}`);
  assert.equal(scopedTasks.body.data.total, 1);
  assert.equal((await pm.agent.get(`/api/v1/staff/cases/${caseId}`)).body.data.workSummary.find(queue => queue.key === 'overdue_tasks').count, 1);
  await WorkspaceMember.updateMany({ workspace: workspace._id, adminUser: { $in: [pm.user._id, reviewer.user._id] } }, { $set: { status: 'removed', removedAt: new Date() } });
  const removed = (await pm.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.equal(removed.myOpenTasks, 0); assert.deepEqual(removed.myTasks, []);
  assert.ok(removed.workQueues.every(queue => queue.count === 0));
  assert.equal((await reviewer.agent.get('/api/v1/staff/work-queues?queue=forms_review')).body.data.count, 0);
  assert.equal((await pm.agent.get(`/api/v1/staff/cases/${caseId}`)).status, 404);
  assert.equal((await operations.agent.get('/api/v1/staff/work-queues?queue=overdue_tasks')).body.data.count, 1);
});

test('a PM can create and manage a restricted conversation with attributable membership and immediate revocation', async () => {
  const operations = await staff('operations_admin'); const pm = await staff('pm'); const reviewer = await staff('reviewer'); const customer = await client();
  const created = await create(operations.agent, { clientId: String(customer._id), projectManagerId: String(pm.user._id), title: 'Restricted conversation', caseType: 'other' });
  const caseId = created.body.data.id; const workspace = await CaseWorkspace.findOne({ case: caseId });
  const member = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: reviewer.user._id, workspaceRole: 'reviewer', status: 'active' });
  const channel = await pm.agent.post(`/api/v1/staff/cases/${caseId}/channels`).send({ name: 'Selected reviewers', visibility: 'restricted_members', channelType: 'private' });
  assert.equal(channel.status, 201, JSON.stringify(channel.body));
  const channelId = channel.body.data.id;
  const list = (await pm.agent.get(`/api/v1/staff/cases/${caseId}/channels`)).body.data;
  assert.ok(list.channels.find(c => c.id === channelId).canManageMembers);
  assert.equal((await reviewer.agent.get(`/api/v1/staff/channels/${channelId}/messages`)).status, 404);
  const added = await pm.agent.post(`/api/v1/staff/channels/${channelId}/members`).send({ workspaceMemberId: String(member._id) });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const channelMemberId = added.body.data.members.find(m => m.workspaceMemberId === String(member._id)).channelMemberId;
  assert.equal((await reviewer.agent.get(`/api/v1/staff/channels/${channelId}/messages`)).status, 200);
  assert.equal((await pm.agent.delete(`/api/v1/staff/channels/${channelId}/members/${channelMemberId}`)).status, 200);
  assert.equal((await reviewer.agent.get(`/api/v1/staff/channels/${channelId}/messages`)).status, 404);
  const audit = await CaseActivity.findOne({ case: caseId, type: 'channel_created' }).lean();
  assert.equal(audit.actorType, 'admin_user'); assert.equal(String(audit.actorId), String(pm.user._id));
});

test('document requests validate type against their category and preserve the requested subject', async () => {
  const operations = await staff('operations_admin'); const pm = await staff('pm'); const customer = await client();
  const created = await create(operations.agent, { clientId: String(customer._id), projectManagerId: String(pm.user._id), title: 'Requested metadata', caseType: 'other' });
  const caseId = created.body.data.id; const workspace = await CaseWorkspace.findOne({ case: caseId });
  const member = await WorkspaceMember.findOne({ workspace: workspace._id, clientUser: customer._id });
  const category = await DocumentCategory.findOne({ case: caseId, templateKey: 'identity_civil_documents' });
  const body = { title: 'Passport', categoryId: String(category._id), requestedFromMemberId: String(member._id), documentType: 'Passport' };
  assert.equal((await pm.agent.post(`/api/v1/staff/cases/${caseId}/document-requests`).send({ ...body, documentType: 'Tax return' })).status, 400);
  const response = await pm.agent.post(`/api/v1/staff/cases/${caseId}/document-requests`).send(body);
  assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.request.documentType, 'Passport');
    const dashboard = await pm.agent.get('/api/v1/staff/dashboard');
    assert.equal(dashboard.body.data.workQueues.find(queue => queue.key === 'requested_documents').count, 1);
});
