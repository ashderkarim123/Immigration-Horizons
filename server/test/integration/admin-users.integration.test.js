/**
 * Admin Users page: creating accounts, the one-time temporary credential, easy
 * password reset for admins AND employees (one account model), editing the
 * sign-in email/role, and the break-glass seed script.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs, uniqueEmail } = require('../helpers/auth');
const { createApp } = require('../../app');
const AdminUser = require('../../models/admin/User');
const EmployeeSession = require('../../models/EmployeeSession');
const { upsertStaffUser } = require('../../scripts/seedStaffUser');

const ORIGIN = 'http://localhost:4000';
let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function agentAs(role) {
  const { email, password, user } = await seedAdminUser({ role });
  const agent = await loginAs(request.agent(app), { email, password });
  return { agent, user };
}

const tempPasswordOn = (html) => (/id="temp-password"[^>]*value="([^"]+)"/.exec(html) || [])[1];
const staffLogin = (email, password) =>
  request(app).post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password });

test('create: generates a temporary password, shows it exactly once, and forces a change at first sign-in', async () => {
  const { agent } = await agentAs('super_admin');

  const created = await agent.post('/admin/users').type('form').send({ name: 'Hissam Baig', email: '  HissamBaig@ImmigrationHorizons.com ', role: 'pm', jobTitle: 'Case Manager' });
  assert.equal(created.status, 302);

  const first = await agent.get('/admin/users');
  const temp = tempPasswordOn(first.text);
  assert.ok(temp && temp.length >= 20, 'temp password is rendered for the admin');
  assert.match(first.text, /hissambaig@immigrationhorizons\.com/, 'email is trimmed and lowercased');
  assert.match(first.text, /Reset password/);

  assert.equal(tempPasswordOn((await agent.get('/admin/users')).text), undefined, 'gone after one view');

  const user = await AdminUser.findOne({ email: 'hissambaig@immigrationhorizons.com' });
  assert.equal(user.mustChangePassword, true);
  assert.notEqual(user.password, temp, 'never stored in plaintext');
  const login = await staffLogin('hissambaig@immigrationhorizons.com', temp);
  assert.equal(login.status, 200);
  assert.equal(login.body.data.mustChangePassword, true);
});

test('create: duplicate email and invalid input are explained, not silently dropped', async () => {
  const { agent } = await agentAs('super_admin');
  await seedAdminUser({ role: 'pm', email: 'taken@immigrationhorizons.com' });

  const dup = await agent.post('/admin/users').type('form').send({ name: 'X', email: 'Taken@immigrationhorizons.com', role: 'pm' });
  assert.equal(dup.status, 400);
  assert.match(dup.text, /already exists/);

  assert.equal((await agent.post('/admin/users').type('form').send({ name: 'X', email: 'not-an-email', role: 'pm' })).status, 400);
  assert.equal((await agent.post('/admin/users').type('form').send({ name: 'X', email: 'x@y.com', role: 'emperor' })).status, 400);
});

test('reset: one click for an employee or an admin issues a new one-time password, signs them out, clears lockout, and invalidates the old password', async () => {
  const { agent } = await agentAs('super_admin');
  for (const role of ['pm', 'admin']) {
    const { user, password: oldPassword } = await seedAdminUser({ role });
    await AdminUser.updateOne({ _id: user._id }, { $set: { failedLoginCount: 7, lockedUntil: new Date(Date.now() + 3600e3) } });
    await EmployeeSession.create({ adminUser: user._id, tokenHash: `h-${role}`, roleSnapshot: role, expiresAt: new Date(Date.now() + 3600e3), idleExpiresAt: new Date(Date.now() + 3600e3) });

    const res = await agent.post(`/admin/users/${user._id}/reset-credentials`).type('form').send({});
    assert.equal(res.status, 302);

    const temp = tempPasswordOn((await agent.get('/admin/users')).text);
    assert.ok(temp, `${role}: temp password shown`);

    const after = await AdminUser.findById(user._id);
    assert.equal(after.mustChangePassword, true);
    assert.equal(after.failedLoginCount, 0);
    assert.equal(after.lockedUntil, null);
    assert.equal(await EmployeeSession.countDocuments({ adminUser: user._id }), 0);
    assert.equal(await bcrypt.compare(oldPassword, after.password), false);
    assert.equal((await staffLogin(after.email, oldPassword)).status, 401);
    assert.equal((await staffLogin(after.email, temp)).status, 200, `${role}: can sign in with the new temporary password`);
  }
});

test('reset: an admin cannot reset a Super Admin; unknown ids are harmless', async () => {
  const { agent } = await agentAs('admin');
  const { user: boss } = await seedAdminUser({ role: 'super_admin' });
  const before = (await AdminUser.findById(boss._id)).password;

  assert.equal((await agent.post(`/admin/users/${boss._id}/reset-credentials`).type('form').send({})).status, 403);
  assert.equal((await AdminUser.findById(boss._id)).password, before);
  assert.equal((await agent.post('/admin/users/not-an-id/reset-credentials').type('form').send({})).status, 302);

  const list = await agent.get('/admin/users');
  assert.doesNotMatch(list.text, new RegExp(`/admin/users/${boss._id}/reset-credentials`), 'no Reset button for accounts the actor cannot touch');
});

test('edit: renders a real edit form, changes the sign-in email (lowercased) and revokes sessions, the new email signs in', async () => {
  const { agent } = await agentAs('super_admin');
  const { user, password } = await seedAdminUser({ role: 'pm', email: 'old@gmail.com' });
  await EmployeeSession.create({ adminUser: user._id, tokenHash: 'h', roleSnapshot: 'pm', expiresAt: new Date(Date.now() + 3600e3), idleExpiresAt: new Date(Date.now() + 3600e3) });

  const form = await agent.get(`/admin/users/${user._id}/edit`);
  assert.equal(form.status, 200);
  assert.match(form.text, new RegExp(`/admin/users/${user._id}\\?_method=PATCH`));
  assert.match(form.text, /name="email" class="form-control" value="old@gmail\.com"/);

  const res = await agent.post(`/admin/users/${user._id}?_method=PATCH`).type('form').send({ name: 'Rahat Karim', email: 'RahatKarim@ImmigrationHorizons.com', role: 'super_admin', jobTitle: 'CEO', department: 'Executive', isActive: 'true' });
  assert.equal(res.status, 302);

  const after = await AdminUser.findById(user._id);
  assert.deepEqual([after.name, after.email, after.role, after.jobTitle], ['Rahat Karim', 'rahatkarim@immigrationhorizons.com', 'super_admin', 'CEO']);
  assert.equal(await EmployeeSession.countDocuments({ adminUser: user._id }), 0, 'sign-in identity changed, sessions revoked');
  assert.equal((await staffLogin('rahatkarim@immigrationhorizons.com', password)).status, 200);
  assert.equal((await staffLogin('old@gmail.com', password)).status, 401);
});

test('edit: duplicate email, invalid email/role and privilege escalation are refused', async () => {
  const { agent } = await agentAs('admin');
  await seedAdminUser({ role: 'pm', email: 'taken@immigrationhorizons.com' });
  const { user } = await seedAdminUser({ role: 'pm', email: 'mine@immigrationhorizons.com' });
  const patch = (body) => agent.post(`/admin/users/${user._id}?_method=PATCH`).type('form').send({ name: 'N', ...body });

  const dup = await patch({ email: 'Taken@immigrationhorizons.com' });
  assert.equal(dup.status, 400);
  assert.match(dup.text, /already uses that email/);
  assert.equal((await patch({ email: 'nope' })).status, 400);
  assert.equal((await patch({ role: 'emperor' })).status, 400);
  assert.equal((await patch({ role: 'super_admin' })).status, 403, 'an admin cannot mint a Super Admin');
  assert.equal((await AdminUser.findById(user._id)).email, 'mine@immigrationhorizons.com');
});

test('edit: the only active Super Admin cannot be demoted or disabled', async () => {
  const { agent, user } = await agentAs('super_admin');
  const patch = (body) => agent.post(`/admin/users/${user._id}?_method=PATCH`).type('form').send({ name: 'Me', ...body });

  assert.match((await patch({ role: 'admin' })).text, /only active Super Admin/);
  assert.match((await patch({ isActive: 'false' })).text, /only active Super Admin/);
  assert.equal((await AdminUser.findById(user._id)).role, 'super_admin');

  await seedAdminUser({ role: 'super_admin' });
  assert.equal((await patch({ role: 'admin' })).status, 302, 'allowed once another Super Admin exists');
});

test('disabling an account revokes its sessions and blocks sign-in', async () => {
  const { agent } = await agentAs('super_admin');
  const { user, password } = await seedAdminUser({ role: 'pm' });
  await EmployeeSession.create({ adminUser: user._id, tokenHash: 'h', roleSnapshot: 'pm', expiresAt: new Date(Date.now() + 3600e3), idleExpiresAt: new Date(Date.now() + 3600e3) });

  await agent.post(`/admin/users/${user._id}?_method=PATCH`).type('form').send({ name: 'P', isActive: 'false' });
  assert.equal(await EmployeeSession.countDocuments({ adminUser: user._id }), 0);
  assert.equal((await staffLogin(user.email, password)).status, 401);
});

test('seed script: creates a working Super Admin (single hash), forces a change for a short password, and recovers an existing locked account', async () => {
  const email = uniqueEmail('ceo');
  const created = await upsertStaffUser({ email: `  ${email.toUpperCase()} `, password: 'Short@1122', name: 'Immigration Horizons Admin' });
  assert.deepEqual([created.created, created.role, created.mustChangePassword], [true, 'super_admin', true]);

  const login = await staffLogin(email, 'Short@1122');
  assert.equal(login.status, 200, 'the password works exactly as typed (not hashed twice)');
  assert.equal(login.body.data.mustChangePassword, true);

  // lost password + lockout on an existing account
  await AdminUser.updateOne({ email }, { $set: { failedLoginCount: 9, lockedUntil: new Date(Date.now() + 3600e3), isActive: false, role: 'viewer' } });
  const recovered = await upsertStaffUser({ email, password: 'a-compliant-password-1' });
  assert.deepEqual([recovered.created, recovered.mustChangePassword], [false, false]);
  const user = await AdminUser.findOne({ email });
  assert.deepEqual([user.role, user.isActive, user.failedLoginCount, user.lockedUntil], ['super_admin', true, 0, null]);
  assert.equal((await staffLogin(email, 'a-compliant-password-1')).status, 200);
  assert.equal((await staffLogin(email, 'Short@1122')).status, 401);

  await assert.rejects(upsertStaffUser({ email: 'bad', password: 'a-compliant-password-1' }), /valid email/);
  await assert.rejects(upsertStaffUser({ email, password: 'short' }), /at least 8/);
  await assert.rejects(upsertStaffUser({ email, password: 'a-compliant-password-1', role: 'emperor' }), /Unknown role/);
});
