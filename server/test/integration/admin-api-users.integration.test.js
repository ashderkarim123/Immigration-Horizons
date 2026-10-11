/**
 * Gate C (ADR-029): employee administration and the role reference through /api/v1/admin — the ADR-016 provisioning
 * rules, the one-time temporary credential, session revocation, DTO secrecy, and agreement with the legacy EJS pages.
 */
const { plantSecrets, assertSafeDto, adminAgent, fieldErrorsOf } = require('../helpers/adminApi');
plantSecrets();

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs, loginAdminApi } = require('../helpers/auth');
const AdminUser = require('../../models/admin/User');
const EmployeeSession = require('../../models/EmployeeSession');
const SecurityEvent = require('../../models/SecurityEvent');
const { ALL_ROLES, ROLE_LABELS, CAPABILITIES, can } = require('../../utils/permissions');

const API = '/api/v1/admin';
const ORIGIN = 'http://localhost:4000';
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

const staffLogin = (email, password) => request(app).post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password });
const staffSession = (user) => EmployeeSession.create({ adminUser: user._id, tokenHash: `h-${user._id}-${Math.random()}`, roleSnapshot: user.role, expiresAt: new Date(Date.now() + 3600e3), idleExpiresAt: new Date(Date.now() + 3600e3) });
const sessionsOf = (user) => EmployeeSession.countDocuments({ adminUser: user._id });
const USER_KEYS = ['actions', 'createdAt', 'credentialIssuedAt', 'department', 'email', 'id', 'isActive', 'isSelf', 'jobTitle', 'lastLoginAt', 'locked', 'mustChangePassword', 'name', 'passwordChangedAt', 'role'];

test('every users/roles route needs users.manage; deleting needs users.delete as well', async () => {
  const target = (await seedAdminUser({ role: 'pm' })).user;
  const editor = (await adminAgent(app, 'editor')).agent;
  for (const res of [
    await editor.get(`${API}/users`), await editor.get(`${API}/users/${target._id}`), await editor.get(`${API}/roles`),
    await editor.post(`${API}/users`).send({ name: 'X', email: 'x@ih.test', role: 'pm' }),
    await editor.patch(`${API}/users/${target._id}`).send({ name: 'Y' }),
    await editor.post(`${API}/users/${target._id}/reset-credentials`), await editor.post(`${API}/users/${target._id}/revoke-sessions`),
    await editor.delete(`${API}/users/${target._id}`),
  ]) assert.equal(res.status, 403);

  const admin = (await adminAgent(app, 'admin')).agent;
  assert.equal((await admin.get(`${API}/users`)).status, 200);
  assert.equal((await admin.delete(`${API}/users/${target._id}`)).status, 403, 'an admin manages users but cannot delete them');
  assert.equal(await AdminUser.countDocuments({ _id: target._id }), 1);
});

test('create: a temporary password is returned exactly once, never stored, logged or retrievable, and forces a change at first sign-in', async () => {
  const { agent, user: actor } = await adminAgent(app, 'admin');
  const res = await agent.post(`${API}/users`).send({ name: '  Hissam Baig ', email: '  HissamBaig@ImmigrationHorizons.com ', role: 'pm', jobTitle: 'Case Manager', department: 'Operations' });
  assert.equal(res.status, 201);
  assert.deepEqual([res.headers['cache-control'], res.headers.pragma], ['no-store', 'no-cache']);
  const { user, temporaryCredential } = res.body.data;
  assert.deepEqual(Object.keys(temporaryCredential).sort(), ['password', 'purpose']);
  assert.equal(temporaryCredential.purpose, 'created');
  assert.ok(temporaryCredential.password.length >= 20);
  assert.deepEqual(Object.keys(user).sort(), USER_KEYS);
  assert.deepEqual([user.name, user.email, user.role, user.jobTitle, user.mustChangePassword, user.isActive], ['Hissam Baig', 'hissambaig@immigrationhorizons.com', { code: 'pm', label: ROLE_LABELS.pm }, 'Case Manager', true, true]);
  assertSafeDto(res.body, { allow: ['password'] });

  const stored = await AdminUser.findById(user.id);
  assert.notEqual(stored.password, temporaryCredential.password);
  assert.equal(await bcrypt.compare(temporaryCredential.password, stored.password), true, 'only the bcrypt hash is stored');

  // never again: not on the record, not in the list, not in any audit entry
  const later = [await agent.get(`${API}/users/${user.id}`), await agent.get(`${API}/users`), await agent.get(`${API}/security-events`)];
  for (const response of later) {
    assert.equal(response.status, 200);
    assertSafeDto(response.body);
    assert.ok(!JSON.stringify(response.body).includes(temporaryCredential.password));
  }
  assert.ok(!JSON.stringify(await SecurityEvent.find().lean()).includes(temporaryCredential.password));
  const event = await SecurityEvent.findOne({ type: 'admin_user_created' });
  assert.deepEqual([String(event.actorAdmin), event.subjectEmail, event.meta], [String(actor._id), 'hissambaig@immigrationhorizons.com', { action: 'created', role: 'pm' }]);
  assert.equal(await SecurityEvent.countDocuments({ type: 'login_succeeded', 'meta.action': 'employee_account_created' }), 0, 'account creation is not recorded as a login');

  const login = await staffLogin('hissambaig@immigrationhorizons.com', temporaryCredential.password);
  assert.equal(login.status, 200);
  assert.equal(login.body.data.mustChangePassword, true);
});

test('create: validation, duplicate email, and only a Super Admin may create a Super Admin', async () => {
  const { agent } = await adminAgent(app, 'admin');
  await seedAdminUser({ role: 'pm', email: 'taken@immigrationhorizons.com' });
  const create = (body) => agent.post(`${API}/users`).send(body);

  assert.deepEqual(Object.keys(fieldErrorsOf(await create({}))).sort(), ['email', 'name', 'role']);
  assert.match(fieldErrorsOf(await create({ name: 'X', email: 'not-an-email', role: 'pm' })).email, /valid email/);
  assert.match(fieldErrorsOf(await create({ name: 'X', email: 'x@y.com', role: 'emperor' })).role, /Invalid role/);
  const dup = await create({ name: 'X', email: 'Taken@immigrationhorizons.com', role: 'pm' });
  assert.deepEqual([dup.status, dup.body.error.code], [409, 'conflict']);
  assert.match(fieldErrorsOf(dup).email, /already exists/);

  const escalation = await create({ name: 'Boss', email: 'boss@ih.test', role: 'super_admin' });
  assert.deepEqual([escalation.status, escalation.body.error.code], [403, 'forbidden']);
  assert.equal(await AdminUser.countDocuments({ email: 'boss@ih.test' }), 0);
  assert.equal((await agent.get(`${API}/users`)).body.data.roles.find((r) => r.code === 'super_admin').assignable, false);

  const boss = (await adminAgent(app, 'super_admin')).agent;
  assert.equal((await boss.post(`${API}/users`).send({ name: 'Boss', email: 'boss@ih.test', role: 'super_admin' })).status, 201);
  assert.equal((await boss.get(`${API}/users`)).body.data.roles.find((r) => r.code === 'super_admin').assignable, true);
});

test('update: only a Super Admin touches a Super Admin; the last active Super Admin cannot be demoted or disabled', async () => {
  const { agent: admin } = await adminAgent(app, 'admin');
  const { agent: boss, user: bossUser } = await adminAgent(app, 'super_admin');
  const pm = (await seedAdminUser({ role: 'pm' })).user;

  assert.equal((await admin.patch(`${API}/users/${bossUser._id}`).send({ name: 'Renamed' })).status, 403);
  assert.equal((await admin.patch(`${API}/users/${pm._id}`).send({ role: 'super_admin' })).status, 403, 'an admin cannot mint a Super Admin');
  assert.equal((await admin.post(`${API}/users/${bossUser._id}/reset-credentials`)).status, 403);
  assert.equal((await admin.post(`${API}/users/${bossUser._id}/revoke-sessions`)).status, 403);
  assert.deepEqual((await admin.get(`${API}/users/${bossUser._id}`)).body.data.actions, { edit: false, resetCredentials: false, revokeSessions: false, delete: false });
  assert.deepEqual([(await AdminUser.findById(bossUser._id)).name, (await AdminUser.findById(pm._id)).role], [bossUser.name, 'pm']);

  const demote = await boss.patch(`${API}/users/${bossUser._id}`).send({ role: 'admin' });
  assert.equal(demote.status, 422);
  assert.match(fieldErrorsOf(demote).role, /only active Super Admin/);
  assert.match(fieldErrorsOf(await boss.patch(`${API}/users/${bossUser._id}`).send({ isActive: false })).isActive, /only active Super Admin/);
  assert.equal((await boss.delete(`${API}/users/${bossUser._id}`)).status, 400, 'nobody deletes the account they are signed in as');

  // an inactive second Super Admin does not count
  const second = (await seedAdminUser({ role: 'super_admin', isActive: false })).user;
  assert.equal((await boss.patch(`${API}/users/${bossUser._id}`).send({ role: 'admin' })).status, 422);
  assert.equal((await boss.patch(`${API}/users/${second._id}`).send({ isActive: true })).status, 200);
  assert.equal((await boss.patch(`${API}/users/${pm._id}`).send({ role: 'super_admin' })).status, 200, 'a Super Admin can promote');
  assert.equal((await boss.patch(`${API}/users/${second._id}`).send({ role: 'editor' })).status, 200, 'allowed while another active Super Admin exists');
});

test('update: field validation, and deactivation or a new sign-in email revokes Staff sessions (a rename does not)', async () => {
  const { agent, user: actor } = await adminAgent(app, 'super_admin');
  const { user, password } = await seedAdminUser({ role: 'pm', email: 'old@ih.test' });
  await seedAdminUser({ role: 'pm', email: 'taken@ih.test' });
  const patch = (body) => agent.patch(`${API}/users/${user._id}`).send(body);

  assert.match(fieldErrorsOf(await patch({ email: 'nope' })).email, /valid email/);
  assert.match(fieldErrorsOf(await patch({ role: 'emperor' })).role, /Invalid role/);
  assert.match(fieldErrorsOf(await patch({ name: '   ' })).name, /required/);
  assert.match(fieldErrorsOf(await patch({ isActive: 'false' })).isActive, /true or false/);
  assert.equal((await patch({ email: 'Taken@ih.test' })).status, 409);
  assert.equal((await agent.patch(`${API}/users/not-an-id`).send({ name: 'x' })).status, 404);

  await staffSession(user);
  const renamed = await patch({ name: 'Rahat Karim', jobTitle: 'CEO', department: 'Executive' });
  assert.deepEqual([renamed.body.data.name, renamed.body.data.jobTitle], ['Rahat Karim', 'CEO']);
  assert.equal(await sessionsOf(user), 1, 'a rename does not sign anyone out');

  assert.equal((await patch({ email: ' New@IH.test ' })).body.data.email, 'new@ih.test');
  assert.equal(await sessionsOf(user), 0, 'the sign-in identity changed');
  assert.equal((await staffLogin('new@ih.test', password)).status, 200);
  assert.equal((await staffLogin('old@ih.test', password)).status, 401);

  await staffSession(user);
  const off = await patch({ isActive: false });
  assert.equal(off.body.data.isActive, false);
  assert.equal(await sessionsOf(user), 0);
  assert.equal((await staffLogin('new@ih.test', password)).status, 401);

  const events = await SecurityEvent.find({ type: 'admin_user_updated' }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(events.map((e) => [e.meta.action, e.meta.changed]), [['updated', ['name', 'jobTitle', 'department']], ['updated', ['email']], ['deactivated', ['isActive']]]);
  assert.ok(events.every((e) => String(e.actorAdmin) === String(actor._id)));
  assert.equal((await patch({ isActive: true })).body.data.isActive, true);
  assert.equal((await SecurityEvent.findOne({ type: 'admin_user_updated', 'meta.action': 'activated' })).subjectEmail, 'new@ih.test');
});

test('a deactivated or demoted administrator loses an existing CMS session on the next request, in both consoles', async () => {
  const { agent: boss } = await adminAgent(app, 'super_admin');
  const creds = await seedAdminUser({ role: 'admin' });
  const api = await loginAdminApi(request.agent(app), creds);
  const ejs = await loginAs(request.agent(app), creds);
  assert.equal((await api.get(`${API}/me`)).status, 200);

  assert.equal((await boss.patch(`${API}/users/${creds.user._id}`).send({ role: 'operations_admin' })).status, 200);
  assert.equal((await api.get(`${API}/me`)).status, 401);
  assert.equal((await ejs.get('/admin')).headers.location, '/admin/login');
  assert.equal((await staffLogin(creds.email, creds.password)).status, 200, 'the Staff application is still theirs');
});

test('reset credentials: a new one-time password, lockout cleared, Staff sessions revoked, old password dead', async () => {
  const { agent } = await adminAgent(app, 'admin');
  const { user, password: oldPassword } = await seedAdminUser({ role: 'pm' });
  await AdminUser.updateOne({ _id: user._id }, { $set: { failedLoginCount: 4, lockedUntil: new Date(Date.now() + 3600e3), passwordChangedAt: new Date() } });
  await staffSession(user);
  assert.equal((await agent.get(`${API}/users/${user._id}`)).body.data.locked, true);

  const res = await agent.post(`${API}/users/${user._id}/reset-credentials`);
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  const { temporaryCredential, user: dto } = res.body.data;
  assert.equal(temporaryCredential.purpose, 'reset');
  assert.deepEqual([dto.mustChangePassword, dto.locked, dto.passwordChangedAt], [true, false, null]);

  const after = await AdminUser.findById(user._id);
  assert.deepEqual([after.failedLoginCount, after.lockedUntil, after.mustChangePassword], [0, null, true]);
  assert.equal(await sessionsOf(user), 0);
  assert.equal((await staffLogin(after.email, oldPassword)).status, 401);
  assert.equal((await staffLogin(after.email, temporaryCredential.password)).status, 200);

  assert.ok(!JSON.stringify((await agent.get(`${API}/users/${user._id}`)).body).includes(temporaryCredential.password));
  const event = await SecurityEvent.findOne({ type: 'admin_credentials_reset' });
  assert.deepEqual([event.subjectEmail, event.meta], [after.email, { action: 'reset', role: 'pm' }]);
  assert.ok(!JSON.stringify(await SecurityEvent.find().lean()).includes(temporaryCredential.password));
  assert.equal((await agent.post(`${API}/users/507f1f77bcf86cd799439011/reset-credentials`)).status, 404);
});

test('revoke sessions: ends Staff sessions only, says how many, and is audited', async () => {
  const { agent } = await adminAgent(app, 'admin');
  const creds = await seedAdminUser({ role: 'admin' });
  await staffSession(creds.user);
  await staffSession(creds.user);
  const cms = await loginAdminApi(request.agent(app), creds);

  const res = await agent.post(`${API}/users/${creds.user._id}/revoke-sessions`);
  assert.equal(res.body.data.revokedStaffSessions, 2);
  assert.equal(await sessionsOf(creds.user), 0);
  assert.equal((await cms.get(`${API}/me`)).status, 200, 'it does not claim to end CMS sessions, and does not');
  assert.equal((await SecurityEvent.findOne({ type: 'admin_staff_sessions_revoked' })).meta.count, 2);
  assert.equal((await agent.post(`${API}/users/${creds.user._id}/revoke-sessions`)).body.data.revokedStaffSessions, 0);
});

test('delete: Super Admin only, never self, never the last Super Admin; sessions go with the account', async () => {
  const { agent: boss, user: bossUser } = await adminAgent(app, 'super_admin');
  const pm = (await seedAdminUser({ role: 'pm' })).user;
  await staffSession(pm);

  assert.equal((await boss.delete(`${API}/users/${bossUser._id}`)).status, 400);
  assert.deepEqual((await boss.delete(`${API}/users/${pm._id}`)).body.data, { deleted: true });
  assert.deepEqual([await AdminUser.countDocuments({ _id: pm._id }), await sessionsOf(pm)], [0, 0]);
  assert.equal((await boss.delete(`${API}/users/${pm._id}`)).status, 404);
  const event = await SecurityEvent.findOne({ type: 'admin_user_deleted' });
  assert.deepEqual([event.subjectEmail, event.meta], [pm.email, { action: 'deleted', role: 'pm' }]);

  const other = (await seedAdminUser({ role: 'super_admin' })).user;
  assert.equal((await boss.delete(`${API}/users/${other._id}`)).status, 200, 'another Super Admin remains');
  assert.equal(await AdminUser.countDocuments({ role: 'super_admin', isActive: true }), 1);
});

test('list: paged, searchable, filterable, and no credential or lockout internals anywhere', async () => {
  const { agent, user: me } = await adminAgent(app, 'admin', { name: 'Ada Admin' });
  await seedAdminUser({ role: 'pm', name: 'Paula Manager', email: 'paula@ih.test' });
  await seedAdminUser({ role: 'editor', name: 'Ed Itor', email: 'ed@ih.test', isActive: false });
  await AdminUser.updateOne({ email: 'paula@ih.test' }, { $set: { failedLoginCount: 3, lockedUntil: new Date(Date.now() + 60000) } });

  const all = await agent.get(`${API}/users`);
  assert.equal(all.body.data.total, 3);
  assertSafeDto(all.body);
  assert.ok(all.body.data.items.every((u) => Object.keys(u).sort().join() === USER_KEYS.join()));
  assert.equal(all.body.data.items.find((u) => u.id === String(me._id)).isSelf, true);
  assert.equal(all.body.data.items.find((u) => u.email === 'paula@ih.test').locked, true);
  assert.deepEqual(all.body.data.roles.map((r) => r.code), ALL_ROLES);

  assert.equal((await agent.get(`${API}/users`).query({ search: 'paula' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/users`).query({ search: 'ED@IH' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/users`).query({ search: '.*' })).body.data.total, 0);
  assert.equal((await agent.get(`${API}/users`).query({ role: 'pm' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/users`).query({ status: 'inactive' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/users`).query({ limit: 1, page: 2 })).body.data.items.length, 1);
});

test('roles: a read-only reference derived from the canonical permission map', async () => {
  const { agent } = await adminAgent(app, 'admin');
  const res = await agent.get(`${API}/roles`);
  const { roles } = res.body.data;
  assert.deepEqual(roles.map((r) => [r.code, r.label]), ALL_ROLES.map((code) => [code, ROLE_LABELS[code]]));
  for (const role of roles) {
    const expected = Object.keys(CAPABILITIES).filter((c) => can({ staff: { role: role.code } }, c));
    assert.deepEqual(role.groups.flatMap((g) => g.capabilities).sort(), expected.sort(), role.code);
    assert.equal(role.capabilityCount, expected.length);
    assert.equal(role.cmsAccess, expected.includes('admin.cms.access'));
  }
  assert.deepEqual(roles.filter((r) => r.cmsAccess).map((r) => r.code), ['super_admin', 'admin', 'editor']);
  const editor = roles.find((r) => r.code === 'editor');
  assert.deepEqual(editor.groups.find((g) => g.domain === 'security_events'), undefined);
  assert.equal(roles.find((r) => r.code === 'admin').groups.find((g) => g.domain === 'security_events').label, 'Security events');
  for (const method of ['post', 'put', 'patch', 'delete']) assert.equal((await agent[method](`${API}/roles`).send({})).status, 404, 'roles cannot be changed here');
});

test('legacy EJS Users pages run the same rules and record the same audit events', async () => {
  const creds = await seedAdminUser({ role: 'admin' });
  const ejs = await loginAs(request.agent(app), creds);
  assert.equal((await ejs.post('/admin/users').type('form').send({ name: 'EJS Person', email: 'ejs@ih.test', role: 'pm' })).status, 302);
  const created = await AdminUser.findOne({ email: 'ejs@ih.test' });
  assert.equal(created.mustChangePassword, true);
  assert.ok(await SecurityEvent.findOne({ type: 'admin_user_created', subjectEmail: 'ejs@ih.test', actorAdmin: creds.user._id }));
  assert.equal(await SecurityEvent.countDocuments({ 'meta.action': 'employee_account_created' }), 0);

  assert.equal((await ejs.post('/admin/users').type('form').send({ name: 'Boss', email: 'boss@ih.test', role: 'super_admin' })).status, 400);
  assert.equal(await AdminUser.countDocuments({ email: 'boss@ih.test' }), 0);

  // the Admin API sees and governs the same account
  const { agent } = await adminAgent(app, 'super_admin');
  assert.equal((await agent.get(`${API}/users`).query({ search: 'ejs@ih.test' })).body.data.total, 1);
  assert.equal((await agent.delete(`${API}/users/${created._id}`)).status, 200);
  assert.equal((await ejs.get(`/admin/users/${created._id}/edit`)).headers.location, '/admin/users');
});
