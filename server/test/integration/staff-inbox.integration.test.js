/**
 * Staff Messages inbox (Stabilization Phase 01, Batch D): one aggregated, unread-first
 * list over the existing WorkspaceChannel / WorkspaceMessage domain, authorized per
 * channel by the same policy as the case Chat tab.
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
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMessage = require('../../models/WorkspaceMessage');
const ChannelMember = require('../../models/ChannelMember');
const messageService = require('../../services/messageService');
const readStateService = require('../../services/readStateService');

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

async function staffAgent(role, { workspaces = [] } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  const members = [];
  for (const workspace of workspaces) {
    members.push(await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'project_manager', status: 'active' }));
  }
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD })).status, 200);
  return { agent, user, members };
}

async function seedCase(title = 'Alpha petition') {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', status: 'active' });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title,
    caseType: 'other',
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  let order = 100; // (workspace, order) is unique
  const channel = (overrides) => WorkspaceChannel.create({ workspace: workspace._id, case: caseDoc._id, slug: unique('ch'), channelType: 'standard', order: (order += 1), visibility: 'clients_and_team', ...overrides });
  return { client, caseDoc, workspace, channel };
}

const clientSays = (channel, client, body, extra = {}) =>
  messageService.createMessage({ channel, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body, idempotencyKey: unique('k'), ...extra });
const inbox = (agent, query = '') => agent.get(`/api/v1/staff/inbox${query}`);

test('lists conversations unread first, then newest activity, with case, channel, audience, sender, preview and unread count', async () => {
  const a = await seedCase('Alpha petition');
  const b = await seedCase('Beta petition');
  const pm = await staffAgent('pm', { workspaces: [a.workspace, b.workspace] });

  const aShared = await a.channel({ name: 'Client & Team' });
  const bStaff = await b.channel({ name: 'Strategy', visibility: 'employees_only', channelType: 'internal' });
  const bShared = await b.channel({ name: 'Updates' });

  await clientSays(aShared, a.client, 'First question from Alpha');
  await new Promise((r) => setTimeout(r, 15));
  await messageService.createMessage({ channel: bStaff, senderType: 'employee', senderAdminId: pm.user._id, senderDisplayName: 'Staff pm', body: 'Internal note', idempotencyKey: unique('k') });
  await new Promise((r) => setTimeout(r, 15));
  await clientSays(bShared, b.client, 'x'.repeat(300));

  // the PM has read Beta's shared channel, so Alpha (older) is the only unread one and must come first
  await readStateService.markChannelRead({ channel: bShared, workspaceMemberId: pm.members[1]._id });

  const res = await inbox(pm.agent);
  assert.equal(res.status, 200);
  const { items, total, unreadTotal } = res.body.data;
  assert.equal(total, 3);
  assert.equal(unreadTotal, 1);
  assert.deepEqual(items.map((i) => i.channelName), ['Client & Team', 'Updates', 'Strategy'], 'unread first, then newest activity');

  assert.deepEqual(items[0].case, { id: String(a.caseDoc._id), caseNumber: a.caseDoc.caseNumber, title: 'Alpha petition' });
  assert.equal(items[0].audience, 'client_and_team');
  assert.equal(items[0].unreadCount, 1);
  assert.deepEqual([items[0].latestMessage.senderName, items[0].latestMessage.senderType, items[0].latestMessage.preview], ['Casey', 'client', 'First question from Alpha']);
  assert.equal(items[1].unreadCount, 0);
  assert.equal(items[1].latestMessage.preview.length, 141, 'long messages are truncated to a preview');
  assert.equal(items[2].audience, 'staff_only');
  assert.equal(items[2].unreadCount, 0, 'the PM’s own message is never unread for them');
});

test('filters: unread only, and search by case number, title or channel name', async () => {
  const a = await seedCase('Alpha petition');
  const b = await seedCase('Beta petition');
  const pm = await staffAgent('pm', { workspaces: [a.workspace, b.workspace] });
  const aCh = await a.channel({ name: 'Client & Team' });
  const bCh = await b.channel({ name: 'Documents chat' });
  await clientSays(aCh, a.client, 'a');
  await clientSays(bCh, b.client, 'b');
  await readStateService.markChannelRead({ channel: bCh, workspaceMemberId: pm.members[1]._id });

  assert.deepEqual((await inbox(pm.agent, '?filter=unread')).body.data.items.map((i) => i.channelName), ['Client & Team']);
  assert.deepEqual((await inbox(pm.agent, '?search=beta')).body.data.items.map((i) => i.channelName), ['Documents chat']);
  assert.deepEqual((await inbox(pm.agent, `?search=${a.caseDoc.caseNumber.toLowerCase()}`)).body.data.items.map((i) => i.channelName), ['Client & Team']);
  assert.deepEqual((await inbox(pm.agent, '?search=documents')).body.data.items.map((i) => i.channelName), ['Documents chat']);
  assert.equal((await inbox(pm.agent, '?search=zzz')).body.data.total, 0);
});

test('security: other cases, restricted channels, removed membership and non-viewer roles never see a conversation', async () => {
  const mine = await seedCase('Mine');
  const theirs = await seedCase('Theirs');
  const pm = await staffAgent('pm', { workspaces: [mine.workspace] });
  const shared = await mine.channel({ name: 'Shared' });
  const restricted = await mine.channel({ name: 'Restricted', visibility: 'restricted_members' });
  const foreign = await theirs.channel({ name: 'Foreign' });
  for (const [ch, ctx] of [[shared, mine], [restricted, mine], [foreign, theirs]]) await clientSays(ch, ctx.client, `hello ${ch.name}`);

  let names = (await inbox(pm.agent)).body.data.items.map((i) => i.channelName);
  assert.deepEqual(names, ['Shared'], 'no other case, no restricted channel without a ChannelMember row');
  assert.ok(!JSON.stringify((await inbox(pm.agent)).body).includes('Foreign'));

  await ChannelMember.create({ channel: restricted._id, workspaceMember: pm.members[0]._id, status: 'active', addedByType: 'system', joinedAt: new Date() });
  names = (await inbox(pm.agent)).body.data.items.map((i) => i.channelName).sort();
  assert.deepEqual(names, ['Restricted', 'Shared']);

  await WorkspaceMember.updateOne({ _id: pm.members[0]._id }, { $set: { status: 'removed' } });
  assert.equal((await inbox(pm.agent)).body.data.total, 0, 'removal empties the inbox immediately');

  const viewer = await staffAgent('viewer');
  assert.equal((await inbox(viewer.agent)).status, 403);
  assert.equal((await request(app).get('/api/v1/staff/inbox')).status, 401);
});

test('an org-wide admin sees every conversation (including restricted), with no unread because read state belongs to a membership', async () => {
  const a = await seedCase();
  const admin = await staffAgent('super_admin');
  const restricted = await a.channel({ name: 'Restricted', visibility: 'restricted_members' });
  await clientSays(restricted, a.client, 'private-ish');

  const res = (await inbox(admin.agent)).body.data;
  assert.deepEqual(res.items.map((i) => [i.channelName, i.audience, i.unreadCount]), [['Restricted', 'restricted', 0]]);
});

test('system-only and deleted-only channels are not conversations; a deleted latest message falls back to the previous one', async () => {
  const a = await seedCase();
  const pm = await staffAgent('pm', { workspaces: [a.workspace] });
  const systemOnly = await a.channel({ name: 'System only' });
  const deleted = await a.channel({ name: 'Edited' });

  await WorkspaceMessage.create({ workspace: a.workspace._id, case: a.caseDoc._id, channel: systemOnly._id, senderType: 'system', senderDisplayName: 'System', body: 'Hana was added', messageType: 'system_update' });
  await clientSays(deleted, a.client, 'keep me');
  await new Promise((r) => setTimeout(r, 15));
  const gone = await clientSays(deleted, a.client, 'delete me');
  await WorkspaceMessage.updateOne({ _id: gone.message._id }, { $set: { deletedAt: new Date(), deletedByType: 'client' } });

  const items = (await inbox(pm.agent)).body.data.items;
  assert.deepEqual(items.map((i) => [i.channelName, i.latestMessage.preview]), [['Edited', 'keep me']]);
});

test('pagination reports flat totals', async () => {
  const a = await seedCase();
  const pm = await staffAgent('pm', { workspaces: [a.workspace] });
  for (const n of [1, 2, 3]) await clientSays(await a.channel({ name: `Chan ${n}` }), a.client, `m${n}`);

  const page2 = (await inbox(pm.agent, '?limit=2&page=2')).body.data;
  assert.deepEqual([page2.total, page2.totalPages, page2.page, page2.pageSize, page2.items.length], [3, 2, 2, 2, 1]);
});
