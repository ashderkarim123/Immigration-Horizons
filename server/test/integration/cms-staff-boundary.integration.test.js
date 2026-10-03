process.env.LOGIN_RATE_LIMIT = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, readCsrfToken, loginAs } = require('../helpers/auth');
const AdminUser = require('../../models/admin/User');
const SecurityEvent = require('../../models/SecurityEvent');
const { ALL_ROLES, can } = require('../../utils/permissions');
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

for (const role of ALL_ROLES.filter(role => !['super_admin', 'admin', 'editor'].includes(role))) {
  test(`${role}: correct CMS credential is denied, audited, and still works on staff`, async () => {
    const creds = await seedAdminUser({ role });
    await AdminUser.updateOne({ _id: creds.user._id }, { $set: { failedLoginCount: 2 } });
    const cms = request.agent(app);
    const token = await readCsrfToken(cms, '/admin/login');
    const denied = await cms.post('/admin/login').type('form').send({ username: creds.email, password: creds.password, _csrf: token });
    assert.equal(denied.status, 200);
    assert.match(denied.text, /Invalid username or password/);
    assert.equal((await cms.get('/admin')).headers.location, '/admin/login');
    assert.equal((await AdminUser.findById(creds.user._id)).failedLoginCount, 2);
    const event = await SecurityEvent.findOne({ actorAdmin: creds.user._id, surface: 'admin_cms', type: 'permission_denied' });
    assert.equal(event.result, 'denied');
    assert.equal(event.meta.reason, 'cms_access_denied');
    const staff = request.agent(app);
    const loggedIn = await staff.post('/api/v1/staff/session/login').set('Origin', 'http://localhost:4000').send({ email: creds.email, password: creds.password });
    assert.equal(loggedIn.status, 200);
    assert.equal((await staff.get('/api/v1/staff/me')).status, 200);
    assert.equal((await staff.get('/admin')).headers.location, '/admin/login');
    assert.equal((await cms.get('/api/v1/staff/me')).status, 401);
  });
}

for (const role of ['super_admin', 'admin', 'editor']) {
  test(`${role}: CMS works independently of a staff session`, async () => {
    const creds = await seedAdminUser({ role });
    const cms = await loginAs(request.agent(app), creds);
    assert.equal((await cms.get('/admin')).status, 200);
    assert.equal((await cms.get('/api/v1/staff/me')).status, 401);
  });
}

test('existing CMS session is revoked immediately on demotion and deactivation', async () => {
  const creds = await seedAdminUser({ role: 'admin' });
  const cms = await loginAs(request.agent(app), creds);
  await AdminUser.updateOne({ _id: creds.user._id }, { $set: { role: 'operations_admin' } });
  assert.equal((await cms.get('/admin/users')).headers.location, '/admin/login');
  await AdminUser.updateOne({ _id: creds.user._id }, { $set: { role: 'admin' } });
  const newSession = await loginAs(request.agent(app), creds);
  await AdminUser.updateOne({ _id: creds.user._id }, { $set: { isActive: false } });
  assert.equal((await newSession.get('/admin')).headers.location, '/admin/login');
});

test('operations role has organization management without CMS or user administration; PM stays scoped', () => {
  for (const capability of ['cases.view_all', 'cases.create', 'cases.assign', 'workspace.members.manage', 'tasks.manage', 'channels.create', 'channel_members.manage']) {
    assert.equal(can({ staff: { role: 'operations_admin' } }, capability), true, capability);
  }
  for (const capability of ['admin.cms.access', 'users.manage', 'settings.manage', 'blog.manage']) {
    assert.equal(can({ staff: { role: 'operations_admin' } }, capability), false, capability);
  }
  assert.equal(can({ staff: { role: 'pm' } }, 'cases.view_all'), false);
  assert.equal(can({ staff: { role: 'pm' } }, 'cases.assign'), false);
});
