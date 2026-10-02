/**
 * Staff tasks (Stabilization Phase 01, Batch C): create / edit / status / assign,
 * ownership-scoped permissions for specialists and reviewers, validation (bad
 * input is a 422, not a Mongoose 500) and immediate loss of access on removal.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const Task = require('../../models/admin/Task');

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

async function staffAgent(role, { workspace = null, workspaceRole = 'contributor' } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  const member = workspace ? await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole, status: 'active' }) : null;
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD })).status, 200);
  return { agent, user, member };
}

async function seedCase() {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', status: 'active' });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Task case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  return { caseDoc, workspace };
}

/** The usual cast: a PM, an assigned specialist, and a reviewer on the case, plus a PM of another case. */
async function seedTeam() {
  const ctx = await seedCase();
  const other = await seedCase();
  const pm = await staffAgent('pm', { workspace: ctx.workspace, workspaceRole: 'project_manager' });
  const writer = await staffAgent('petition_writer', { workspace: ctx.workspace });
  const reviewer = await staffAgent('reviewer', { workspace: ctx.workspace, workspaceRole: 'reviewer' });
  const outsider = await staffAgent('pm', { workspace: other.workspace, workspaceRole: 'project_manager' });
  return { ...ctx, pm, writer, reviewer, outsider };
}

const casePath = (c) => `/api/v1/staff/cases/${c._id}/tasks`;
const create = (agent, c, body) => agent.post(casePath(c)).set('Origin', ORIGIN).send(body);
const patch = (agent, id, suffix, body) => agent.patch(`/api/v1/staff/tasks/${id}${suffix}`).set('Origin', ORIGIN).send(body);

async function seedTask(team, overrides = {}) {
  return Task.create({ case: team.caseDoc._id, title: 'Draft petition', assignee: team.writer.user._id, assigneeName: 'Writer', ...overrides });
}

test('create: a PM adds a case task; the response is the full DTO with this actor’s actions; status always starts at todo', async () => {
  const t = await seedTeam();
  const res = await create(t.pm.agent, t.caseDoc, { title: '  Gather transcripts ', type: 'Evidence Review', priority: 'high', dueDate: '2030-01-15', description: 'From the registrar.', assignee: String(t.writer.user._id), status: 'completed' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const d = res.body.data;
  assert.deepEqual([d.title, d.type, d.priority, d.status, d.description], ['Gather transcripts', 'Evidence Review', 'high', 'todo', 'From the registrar.']);
  assert.equal(d.case.id, String(t.caseDoc._id));
  assert.equal(d.assignee.id, String(t.writer.user._id));
  assert.deepEqual(d.actions, { canEdit: true, canChangeStatus: true, canAssign: true });
  assert.equal(d._id, undefined);
});

test('create: validation errors are 422 with field errors, never a 500', async () => {
  const t = await seedTeam();
  const outsiderUser = await AdminUser.create({ name: 'Not on case', email: `${unique('x')}@ih.test`, password: PASSWORD, role: 'pm' });
  const bad = [
    [{}, 'title'],
    [{ title: '   ' }, 'title'],
    [{ title: 'x'.repeat(201) }, 'title'],
    [{ title: 'ok', type: 'Teleportation' }, 'type'],
    [{ title: 'ok', priority: 'asap' }, 'priority'],
    [{ title: 'ok', dueDate: 'next tuesday-ish' }, 'dueDate'],
    [{ title: 'ok', assignee: 'nope' }, 'assignee'],
    [{ title: 'ok', assignee: String(outsiderUser._id) }, 'assignee'],
  ];
  for (const [body, field] of bad) {
    const res = await create(t.pm.agent, t.caseDoc, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.ok(res.body.error.fieldErrors.some((e) => e.field === field), `${JSON.stringify(body)} -> ${field}`);
  }
  assert.equal(await Task.countDocuments({}), 0);
});

test('create: only task managers who are on the case; others 403 / concealed 404; untrusted origin refused', async () => {
  const t = await seedTeam();
  assert.equal((await create(t.writer.agent, t.caseDoc, { title: 'x' })).status, 403, 'a specialist cannot hand out work');
  assert.equal((await create(t.reviewer.agent, t.caseDoc, { title: 'x' })).status, 403);
  assert.equal((await create(t.outsider.agent, t.caseDoc, { title: 'x' })).status, 404, 'another case’s PM does not even learn the case exists');
  const evil = await t.pm.agent.post(casePath(t.caseDoc)).set('Origin', 'https://evil.example.com').send({ title: 'x' });
  assert.equal(evil.status, 403);
  assert.equal(await Task.countDocuments({}), 0);
});

test('list: a case task list carries per-task actions and canCreate', async () => {
  const t = await seedTeam();
  await seedTask(t, { title: 'Mine' });
  await seedTask(t, { title: 'Someone else’s', assignee: t.pm.user._id });

  const asWriter = (await t.writer.agent.get(casePath(t.caseDoc))).body.data;
  assert.equal(asWriter.canCreate, false);
  const mine = asWriter.tasks.find((x) => x.title === 'Mine');
  const theirs = asWriter.tasks.find((x) => x.title === 'Someone else’s');
  assert.deepEqual(mine.actions, { canEdit: true, canChangeStatus: true, canAssign: false });
  assert.deepEqual(theirs.actions, { canEdit: false, canChangeStatus: false, canAssign: false });

  const asPm = (await t.pm.agent.get(casePath(t.caseDoc))).body.data;
  assert.equal(asPm.canCreate, true);
  assert.ok(asPm.tasks.every((x) => x.actions.canEdit && x.actions.canAssign));

  const asReviewer = (await t.reviewer.agent.get(casePath(t.caseDoc))).body.data;
  assert.equal(asReviewer.canCreate, false);
  assert.ok(asReviewer.tasks.every((x) => !x.actions.canEdit && !x.actions.canChangeStatus && !x.actions.canAssign));
});

test('ownership: the assignee can edit and move their own task but not reassign it or touch a colleague’s', async () => {
  const t = await seedTeam();
  const own = await seedTask(t, { title: 'Own' });
  const other = await seedTask(t, { title: 'Other', assignee: t.pm.user._id });

  const status = await patch(t.writer.agent, own._id, '/status', { status: 'in_progress' });
  assert.equal(status.status, 200);
  assert.equal(status.body.data.status, 'in_progress');

  const edit = await patch(t.writer.agent, own._id, '', { title: 'Own, renamed', priority: 'urgent' });
  assert.equal(edit.status, 200);
  assert.deepEqual([edit.body.data.title, edit.body.data.priority], ['Own, renamed', 'urgent']);

  assert.equal((await patch(t.writer.agent, own._id, '/assignee', { assignee: String(t.pm.user._id) })).status, 403, 'no self-reassigning');
  assert.equal((await patch(t.writer.agent, other._id, '/status', { status: 'completed' })).status, 403);
  assert.equal((await patch(t.writer.agent, other._id, '', { title: 'hijack' })).status, 403);
  assert.equal((await Task.findById(other._id)).title, 'Other');

  // a reviewer who is not the assignee has no task rights at all
  assert.equal((await patch(t.reviewer.agent, own._id, '/status', { status: 'completed' })).status, 403);
});

test('ownership: removal from the case revokes the assignee’s access immediately (list, read, edit)', async () => {
  const t = await seedTeam();
  const own = await seedTask(t);
  assert.equal((await t.writer.agent.get(`/api/v1/staff/tasks/${own._id}`)).status, 200);
  assert.equal((await t.writer.agent.get('/api/v1/staff/tasks')).body.data.total, 1);

  await WorkspaceMember.updateOne({ _id: t.writer.member._id }, { $set: { status: 'removed' } });

  assert.equal((await t.writer.agent.get(`/api/v1/staff/tasks/${own._id}`)).status, 404);
  assert.equal((await patch(t.writer.agent, own._id, '/status', { status: 'completed' })).status, 404);
  assert.equal((await t.writer.agent.get('/api/v1/staff/tasks')).body.data.total, 0);
  assert.equal((await Task.findById(own._id)).status, 'todo');
});

test('concealment: a PM of another case gets 404, not 403, for a task they cannot see', async () => {
  const t = await seedTeam();
  const task = await seedTask(t);
  assert.equal((await t.outsider.agent.get(`/api/v1/staff/tasks/${task._id}`)).status, 404);
  assert.equal((await patch(t.outsider.agent, task._id, '/status', { status: 'completed' })).status, 404);
  assert.equal((await t.pm.agent.get('/api/v1/staff/tasks/not-an-id')).status, 404);
});

test('status: valid transitions stamp completedAt and reopening clears it; invalid or missing status is 422', async () => {
  const t = await seedTeam();
  const task = await seedTask(t);
  const done = await patch(t.pm.agent, task._id, '/status', { status: 'completed' });
  assert.ok(done.body.data.completedAt);
  const reopened = await patch(t.pm.agent, task._id, '/status', { status: 'review' });
  assert.equal(reopened.body.data.completedAt, null);
  assert.equal((await patch(t.pm.agent, task._id, '/status', { status: 'finished' })).status, 422);
  assert.equal((await patch(t.pm.agent, task._id, '/status', {})).status, 422);
});

test('edit: invalid values are 422; a due date can be cleared; unchanged edits are accepted', async () => {
  const t = await seedTeam();
  const task = await seedTask(t, { dueDate: new Date('2030-01-01') });
  for (const body of [{ title: '' }, { type: 'Nope' }, { priority: 'asap' }, { dueDate: 'soon' }]) {
    assert.equal((await patch(t.pm.agent, task._id, '', body)).status, 422, JSON.stringify(body));
  }
  const cleared = await patch(t.pm.agent, task._id, '', { dueDate: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.dueDate, null);
  assert.equal((await patch(t.pm.agent, task._id, '', {})).status, 200);
});

test('assign: managers assign to case members and unassign with null; non-members and a missing field are 422', async () => {
  const t = await seedTeam();
  const task = await seedTask(t, { assignee: null, assigneeName: '' });
  const stranger = await AdminUser.create({ name: 'Stranger', email: `${unique('s')}@ih.test`, password: PASSWORD, role: 'petition_writer' });

  const assigned = await patch(t.pm.agent, task._id, '/assignee', { assignee: String(t.writer.user._id) });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.data.assignee.displayName, 'Staff petition_writer');

  assert.equal((await patch(t.pm.agent, task._id, '/assignee', { assignee: String(stranger._id) })).status, 422);
  assert.equal((await patch(t.pm.agent, task._id, '/assignee', {})).status, 422);
  const unassigned = await patch(t.pm.agent, task._id, '/assignee', { assignee: null });
  assert.equal(unassigned.status, 200);
  assert.equal(unassigned.body.data.assignee, null);
});

test('global list: mine by default, all needs tasks.view_all, unknown scope is rejected, flags match what the server then allows', async () => {
  const t = await seedTeam();
  const own = await seedTask(t, { title: 'Own' });
  await seedTask(t, { title: 'Theirs', assignee: t.pm.user._id });

  const mine = (await t.writer.agent.get('/api/v1/staff/tasks')).body.data;
  assert.deepEqual(mine.items.map((i) => i.title), ['Own']);
  assert.equal(mine.items[0].case.caseNumber, t.caseDoc.caseNumber);
  assert.equal((await t.writer.agent.get('/api/v1/staff/tasks?scope=all')).status, 403);
  assert.equal((await t.pm.agent.get('/api/v1/staff/tasks?scope=team')).status, 400);

  const admin = await staffAgent('super_admin');
  const all = (await admin.agent.get('/api/v1/staff/tasks?scope=all')).body.data;
  assert.equal(all.total, 2);
  assert.ok(all.items.every((i) => i.actions.canEdit && i.actions.canAssign));

  // flags are the same function the routes enforce
  assert.equal(mine.items[0].actions.canChangeStatus, true);
  assert.equal((await patch(t.writer.agent, own._id, '/status', { status: 'waiting' })).status, 200);
  assert.equal(mine.items[0].actions.canAssign, false);
  assert.equal((await patch(t.writer.agent, own._id, '/assignee', { assignee: null })).status, 403);
});

test('lead (non-case) tasks keep their rules: managers and the assignee only', async () => {
  const t = await seedTeam();
  const lead = await Task.create({ title: 'Call lead', assignee: t.writer.user._id, assigneeName: 'W' });
  const unowned = await Task.create({ title: 'Unowned lead task' });

  assert.equal((await patch(t.writer.agent, lead._id, '/status', { status: 'completed' })).status, 200);
  assert.equal((await patch(t.writer.agent, unowned._id, '/status', { status: 'completed' })).status, 403);
  assert.equal((await patch(t.pm.agent, unowned._id, '/status', { status: 'completed' })).status, 200);
  assert.equal((await patch(t.reviewer.agent, unowned._id, '', { title: 'x' })).status, 403);
});

test('the Angular task option lists match the server (drift guard)', () => {
  const Task_ = require('../../models/admin/Task');
  const src = fs.readFileSync(path.join(__dirname, '../../../enterprise-ui/projects/case-management/src/app/core/api/task.types.ts'), 'utf8');
  for (const v of [...Task_.TYPES, ...Task_.STATUSES, ...Task_.PRIORITIES]) assert.ok(src.includes(`'${v}'`), `task.types.ts is missing '${v}'`);
});
