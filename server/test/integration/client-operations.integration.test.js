process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');

const { createApp } = require('../../app');
const ClientUser = require('../../models/ClientUser');
const ClientSession = require('../../models/ClientSession');
const PortalInvitation = require('../../models/PortalInvitation');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const Consultation = require('../../models/Consultation');
const AdminUser = require('../../models/admin/User');

const clientAccountService = require('../../services/clientAccountService');
const mailer = require('../../services/mailer');

let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
  // One seam for every adapter since ADR-013 — services/mailer.js is the
  // only place a provider is reached, so intercepting it covers them all.
  mailer._setTransportForTests(async () => true);
});

test.after(async () => {
  mailer._resetTransportForTests();
  await stopTestDb();
});

test.beforeEach(clearCollections);

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return { agent, user: creds.user };
}

let clientCounter = 0;
async function seedClient(overrides = {}) {
  clientCounter += 1;
  const email = `client-ops-${Date.now()}-${clientCounter}@example.com`;
  return ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: 'hashed',
    firstName: 'Test',
    lastName: 'Client',
    status: 'active',
    ...overrides,
  });
}

async function seedSession(client) {
  return ClientSession.create({
    clientUser: client._id,
    tokenHash: `hash-${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(Date.now() + 86400000),
    idleExpiresAt: new Date(Date.now() + 3600000),
    createdIp: '203.0.113.5',
  });
}

// ---------------------------------------------------------------------------
// Capability enforcement
// ---------------------------------------------------------------------------

test('a viewer cannot reach the client list or any client action', async () => {
  const { agent } = await loggedInAs('viewer');
  const client = await seedClient();

  assert.equal((await agent.get('/admin/clients')).status, 403);
  assert.equal((await agent.get(`/admin/clients/${client._id}`)).status, 403);
  assert.equal((await agent.post(`/admin/clients/${client._id}/disable`)).status, 403);
  assert.equal((await agent.post(`/admin/clients/${client._id}/resend-invitation`)).status, 403);
});

test('a pm can VIEW clients but cannot manage them (clients.manage is admin-tier)', async () => {
  const { agent } = await loggedInAs('pm');
  const client = await seedClient();

  assert.equal((await agent.get('/admin/clients')).status, 200);
  assert.equal((await agent.get(`/admin/clients/${client._id}`)).status, 200);

  assert.equal((await agent.post(`/admin/clients/${client._id}/disable`)).status, 403);
  assert.equal((await agent.post(`/admin/clients/${client._id}/resend-invitation`)).status, 403);
  assert.equal((await agent.post(`/admin/clients/${client._id}/revoke-invitation`)).status, 403);
  assert.equal((await agent.post(`/admin/clients/${client._id}/reactivate`)).status, 403);
});

test('an admin can view and manage clients', async () => {
  const { agent } = await loggedInAs('admin');
  const client = await seedClient();
  assert.equal((await agent.get('/admin/clients')).status, 200);
  assert.equal((await agent.post(`/admin/clients/${client._id}/disable`)).status, 302);
});

// ---------------------------------------------------------------------------
// List and detail
// ---------------------------------------------------------------------------

test('the client list filters by status and search, and never renders a password hash', async () => {
  const { agent } = await loggedInAs('admin');
  await seedClient({ firstName: 'Findable', lastName: 'Person', passwordHash: 'super-secret-hash-value' });
  await seedClient({ firstName: 'Other', status: 'disabled' });

  const all = await agent.get('/admin/clients');
  assert.equal(all.status, 200);
  assert.ok(all.text.includes('Findable'));
  assert.ok(all.text.includes('Other'));
  assert.ok(!all.text.includes('super-secret-hash-value'), 'password hash must never reach the page');

  const filtered = await agent.get('/admin/clients?status=disabled');
  assert.ok(!filtered.text.includes('Findable'));
  assert.ok(filtered.text.includes('Other'));

  const searched = await agent.get('/admin/clients?search=Findable');
  assert.ok(searched.text.includes('Findable'));
  assert.ok(!searched.text.includes('>Other<'));
});

test('a regex metacharacter in the search box is escaped, not executed', async () => {
  const { agent } = await loggedInAs('admin');
  await seedClient({ firstName: 'Normal' });

  const res = await agent.get('/admin/clients?search=' + encodeURIComponent('.*'));
  assert.equal(res.status, 200);
  // A literal ".*" matches no name — if it were treated as a pattern it
  // would match every client.
  assert.ok(!res.text.includes('Normal'), 'search must be a literal, not a live regex');
});

test('the client detail page shows linked consultations and the security summary', async () => {
  const { agent } = await loggedInAs('admin');
  const client = await seedClient();
  await Consultation.create({
    name: 'Test Client',
    email: client.email,
    message: 'x'.repeat(20),
    service: 'EB-2 NIW',
    clientUser: client._id,
  });
  await seedSession(client);

  const res = await agent.get(`/admin/clients/${client._id}`);
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('EB-2 NIW'));
  assert.ok(res.text.includes('203.0.113.5'), 'active session IP should appear in the security summary');
});

test('a client detail page never leaks a session or invitation token hash', async () => {
  const { agent } = await loggedInAs('admin');
  const client = await seedClient();
  const session = await ClientSession.create({
    clientUser: client._id,
    tokenHash: 'session-token-hash-must-not-render',
    expiresAt: new Date(Date.now() + 86400000),
    idleExpiresAt: new Date(Date.now() + 3600000),
  });
  await PortalInvitation.create({
    normalizedEmail: client.normalizedEmail,
    tokenHash: 'invitation-token-hash-must-not-render',
    expiresAt: new Date(Date.now() + 86400000),
  });

  const res = await agent.get(`/admin/clients/${client._id}`);
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes(session.tokenHash));
  assert.ok(!res.text.includes('invitation-token-hash-must-not-render'));
});

// ---------------------------------------------------------------------------
// Case visibility on the client detail page (ADR-007 §8)
// ---------------------------------------------------------------------------

async function seedCaseFor(client, pm) {
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Visible Case Title',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pm._id,
    createdBy: pm._id,
    createdByName: pm.name,
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: 'primary',
    name: 'WS',
    createdBy: pm._id,
    createdByName: pm.name,
  });
  return { caseDoc, workspace };
}

test('a pm sees a client case only when they are an active member of its workspace', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const client = await seedClient();
  const otherPm = await AdminUser.create({
    name: 'Other PM',
    email: `other-pm-${Date.now()}@example.com`,
    password: 'x',
    role: 'pm',
  });
  const { workspace } = await seedCaseFor(client, otherPm);

  const before = await agent.get(`/admin/clients/${client._id}`);
  assert.ok(!before.text.includes('Visible Case Title'), 'a non-member PM must not see the case');

  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'active',
  });

  const after = await agent.get(`/admin/clients/${client._id}`);
  assert.ok(after.text.includes('Visible Case Title'), 'an active member PM must see the case');
});

test('an admin (cases.view_all) sees a client case without any workspace membership', async () => {
  const { agent } = await loggedInAs('admin');
  const client = await seedClient();
  const pm = await AdminUser.create({
    name: 'Some PM',
    email: `some-pm-${Date.now()}@example.com`,
    password: 'x',
    role: 'pm',
  });
  await seedCaseFor(client, pm);

  const res = await agent.get(`/admin/clients/${client._id}`);
  assert.ok(res.text.includes('Visible Case Title'));
});

// ---------------------------------------------------------------------------
// Account actions
// ---------------------------------------------------------------------------

test('resending an invitation revokes the previous one and issues exactly one active invitation', async () => {
  const client = await seedClient();
  const now = new Date();
  const stale = await PortalInvitation.create({
    normalizedEmail: client.normalizedEmail,
    tokenHash: 'stale-hash',
    purpose: 'consultation_activation',
    expiresAt: new Date(now.getTime() + 86400000),
  });

  const result = await clientAccountService.resendInvitation({
    clientId: client._id,
    actor: { type: 'admin_user', id: null, name: 'Admin' },
  });
  assert.equal(result.outcome, 'issued');

  const refreshedStale = await PortalInvitation.findById(stale._id).lean();
  assert.ok(refreshedStale.revokedAt, 'the previous invitation must be revoked');

  const active = await PortalInvitation.countDocuments({
    normalizedEmail: client.normalizedEmail,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  assert.equal(active, 1, 'exactly one active invitation may exist at a time');
});

test('a disabled account cannot be issued a new invitation until it is reactivated', async () => {
  const client = await seedClient({ status: 'disabled' });
  const result = await clientAccountService.resendInvitation({
    clientId: client._id,
    actor: { type: 'admin_user', id: null, name: 'Admin' },
  });
  assert.equal(result.outcome, 'validation_error');
  assert.equal(await PortalInvitation.countDocuments({}), 0);
});

test('disabling a client revokes every live session immediately (ADR-007 §3)', async () => {
  const { agent } = await loggedInAs('admin');
  const client = await seedClient();
  await seedSession(client);
  await seedSession(client);
  assert.equal(await ClientSession.countDocuments({ clientUser: client._id }), 2);

  const res = await agent.post(`/admin/clients/${client._id}/disable`);
  assert.equal(res.status, 302);

  const refreshed = await ClientUser.findById(client._id).lean();
  assert.equal(refreshed.status, 'disabled');
  assert.equal(await ClientSession.countDocuments({ clientUser: client._id }), 0);
});

test('reactivating restores an activated account to active and clears the lockout', async () => {
  const client = await seedClient({ status: 'disabled', failedLoginCount: 5, lockedUntil: new Date(Date.now() + 60000) });
  const result = await clientAccountService.reactivateClient(client._id);

  assert.equal(result.outcome, 'reactivated');
  assert.equal(result.client.status, 'active');
  assert.equal(result.client.failedLoginCount, 0);
  assert.equal(result.client.lockedUntil, null);
});

test('reactivating an account that never set a password returns it to pending, not active', async () => {
  const client = await seedClient({ status: 'disabled', passwordHash: '' });
  const result = await clientAccountService.reactivateClient(client._id);
  assert.equal(result.client.status, 'pending');
});

test('reactivating does NOT restore revoked sessions', async () => {
  const client = await seedClient();
  await seedSession(client);
  await clientAccountService.disableClient(client._id);
  await clientAccountService.reactivateClient(client._id);
  assert.equal(await ClientSession.countDocuments({ clientUser: client._id }), 0);
});

test('revoking invitations leaves already-used ones untouched', async () => {
  const client = await seedClient();
  const used = await PortalInvitation.create({
    normalizedEmail: client.normalizedEmail,
    tokenHash: 'used-hash',
    expiresAt: new Date(Date.now() + 86400000),
    usedAt: new Date(),
  });
  await PortalInvitation.create({
    normalizedEmail: client.normalizedEmail,
    tokenHash: 'live-hash',
    expiresAt: new Date(Date.now() + 86400000),
  });

  const result = await clientAccountService.revokeInvitations(client._id);
  assert.equal(result.revokedCount, 1);

  const refreshedUsed = await PortalInvitation.findById(used._id).lean();
  assert.equal(refreshedUsed.revokedAt, null, 'a used invitation must not be retroactively revoked');
});

test('an unknown client id is handled as not_found rather than throwing', async () => {
  const missing = '507f1f77bcf86cd799439011';
  assert.equal((await clientAccountService.disableClient(missing)).outcome, 'not_found');
  assert.equal((await clientAccountService.reactivateClient(missing)).outcome, 'not_found');
  assert.equal((await clientAccountService.revokeInvitations(missing)).outcome, 'not_found');
  assert.equal(await clientAccountService.getClientOverview('not-an-object-id'), null);
});
