/**
 * Gate A (ADR-029): the JSON Admin API signs in real DB-backed administrators only, on the CMS session, behind the
 * session CSRF token and a same-origin check — and neither the Staff nor the Client identity can reach it.
 */
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.ADMIN_USERNAME = 'breakglass';
process.env.ADMIN_PASSWORD = 'Break-Glass-Only-1!';
delete process.env.ADMIN_PASSWORD_HASH;
delete process.env.ADMIN_URL;

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs, loginStaffAs, loginAdminApi, readCsrfToken, ADMIN_API_ORIGIN: ORIGIN } = require('../helpers/auth');
const AdminUser = require('../../models/admin/User');
const SecurityEvent = require('../../models/SecurityEvent');
const { isTrustedAdminOrigin } = require('../../middleware/api/adminAuth');
const { MAX_FAILED_LOGIN_ATTEMPTS } = require('../../utils/lockout');

const API = '/api/v1/admin';
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

const bootstrap = async (agent) => (await agent.get(`${API}/session/bootstrap`)).body.data;
const login = (agent, token, body, origin = ORIGIN) => {
  const req = agent.post(`${API}/session/login`).send(body);
  if (origin) req.set('Origin', origin);
  if (token) req.set('X-CSRF-Token', token);
  return req;
};
const sessionCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('connect.sid=')) || '';
const assertEnvelope = (res, status, code) => {
  assert.equal(res.status, status);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.body.error.code, code);
  assert.ok(res.body.error.requestId, 'request id in the envelope');
  assert.equal(res.headers['x-request-id'], res.body.error.requestId);
};

test('bootstrap: issues a session-bound CSRF token and reports no session, exposing nothing else', async () => {
  const agent = request.agent(app);
  const res = await agent.get(`${API}/session/bootstrap`);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.data).sort(), ['authenticated', 'csrfToken']);
  assert.equal(res.body.data.authenticated, false);
  assert.ok(res.body.data.csrfToken.length >= 32);
  assert.match(sessionCookie(res), /HttpOnly/i);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal((await bootstrap(agent)).csrfToken, res.body.data.csrfToken, 'the token is stable for the session');
});

test('login: a DB-backed admin signs in, the session id and CSRF token are regenerated, and /me is a safe DTO', async () => {
  const creds = await seedAdminUser({ role: 'admin', name: 'Ada Admin' });
  const agent = request.agent(app);
  const first = await agent.get(`${API}/session/bootstrap`);
  const before = sessionCookie(first).split(';')[0];
  const pre = first.body.data.csrfToken;

  const res = await login(agent, pre, { email: `  ${creds.email.toUpperCase()} `, password: creds.password });
  assert.equal(res.status, 200);
  assert.notEqual(sessionCookie(res).split(';')[0], before, 'session fixation: a new session id after sign-in');
  assert.notEqual(res.body.data.csrfToken, pre, 'the pre-login token is discarded');
  assert.deepEqual(res.body.data.admin.role, { code: 'admin', label: 'Admin' });

  const me = await agent.get(`${API}/me`);
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys(me.body.data).sort(), ['capabilities', 'department', 'email', 'id', 'jobTitle', 'name', 'role']);
  assert.equal(me.body.data.email, creds.email);
  assert.ok(me.body.data.capabilities.includes('users.manage') && me.body.data.capabilities.includes('security_events.view'));
  assert.equal(me.body.data.capabilities.includes('users.delete'), false);
  assert.doesNotMatch(JSON.stringify(me.body), /password|failedLogin|lockedUntil|\$2[aby]\$/);
  assert.deepEqual(await bootstrap(agent), { authenticated: true, csrfToken: res.body.data.csrfToken });

  const user = await AdminUser.findById(creds.user._id);
  assert.ok(user.lastLoginAt);
  const event = await SecurityEvent.findOne({ type: 'login_succeeded', actorAdmin: user._id });
  assert.deepEqual([event.surface, event.actorType, event.meta.via], ['admin_cms', 'admin_user', 'admin_api']);

  // the discarded pre-login token cannot authorize anything on the authenticated session
  assertEnvelope(await agent.post(`${API}/session/logout`).set('Origin', ORIGIN).set('X-CSRF-Token', pre), 403, 'csrf_invalid');
  assert.equal((await agent.get(`${API}/me`)).status, 200);
});

test('login: a wrong password and an unknown email get the same generic refusal, and the failure is counted and audited', async () => {
  const creds = await seedAdminUser({ role: 'admin' });
  const agent = request.agent(app);
  const token = (await bootstrap(agent)).csrfToken;

  const wrong = await login(agent, token, { email: creds.email, password: 'not-it' });
  const unknown = await login(agent, token, { email: 'nobody@test.invalid', password: 'not-it' });
  assertEnvelope(wrong, 401, 'unauthenticated');
  assertEnvelope(unknown, 401, 'unauthenticated');
  assert.equal(wrong.body.error.message, unknown.body.error.message);
  assert.equal((await AdminUser.findById(creds.user._id)).failedLoginCount, 1);
  assert.equal((await SecurityEvent.findOne({ type: 'login_failed', actorAdmin: creds.user._id })).meta.reason, 'bad_password');
  assert.equal((await SecurityEvent.findOne({ type: 'login_failed', subjectEmail: 'nobody@test.invalid' })).meta.reason, 'no_such_account');
  assert.equal((await agent.get(`${API}/me`)).status, 401);
  assertEnvelope(await login(agent, token, { email: creds.email }), 422, 'validation_error');
});

test('login: the shared lockout trips on the Nth failure and then refuses even the correct password', async () => {
  const creds = await seedAdminUser({ role: 'super_admin' });
  const agent = request.agent(app);
  const token = (await bootstrap(agent)).csrfToken;
  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) await login(agent, token, { email: creds.email, password: 'guess' });
  assert.ok((await AdminUser.findById(creds.user._id)).lockedUntil > new Date());
  assert.ok(await SecurityEvent.findOne({ type: 'account_locked', actorAdmin: creds.user._id }));
  assertEnvelope(await login(agent, token, creds), 401, 'unauthenticated');
  assert.equal((await SecurityEvent.findOne({ type: 'login_failed', 'meta.reason': 'account_locked' })).result, 'denied');
});

test('login: an inactive account and every role without admin.cms.access are refused with the correct password, counters untouched', async () => {
  const inactive = await seedAdminUser({ role: 'admin', isActive: false });
  const agent = request.agent(app);
  const token = (await bootstrap(agent)).csrfToken;
  assertEnvelope(await login(agent, token, inactive), 401, 'unauthenticated');
  assert.equal((await SecurityEvent.findOne({ actorAdmin: inactive.user._id })).meta.reason, 'account_deactivated');

  for (const role of ['operations_admin', 'pm', 'viewer']) {
    const creds = await seedAdminUser({ role });
    await AdminUser.updateOne({ _id: creds.user._id }, { $set: { failedLoginCount: 2 } });
    assertEnvelope(await login(agent, token, creds), 401, 'unauthenticated');
    assert.equal((await AdminUser.findById(creds.user._id)).failedLoginCount, 2, `${role}: a correct credential is not a guess`);
    const event = await SecurityEvent.findOne({ type: 'permission_denied', actorAdmin: creds.user._id });
    assert.deepEqual([event.meta.reason, event.meta.role], ['cms_access_denied', role]);
  }
  assert.equal((await agent.get(`${API}/me`)).status, 401);
});

test('login: editor and super_admin get exactly the capabilities their role holds', async () => {
  const editor = await loginAdminApi(request.agent(app), await seedAdminUser({ role: 'editor' }));
  const caps = (await editor.get(`${API}/me`)).body.data.capabilities;
  for (const c of ['admin.cms.access', 'blog.manage', 'faqs.manage', 'testimonials.manage', 'media.manage', 'seo.manage']) assert.ok(caps.includes(c), c);
  for (const c of ['users.manage', 'settings.manage', 'security_events.view', 'users.delete']) assert.equal(caps.includes(c), false, c);

  const boss = await loginAdminApi(request.agent(app), await seedAdminUser({ role: 'super_admin' }));
  assert.ok((await boss.get(`${API}/me`)).body.data.capabilities.includes('users.delete'));
});

test('live re-check: demotion, deactivation and deletion end Admin API access on the very next request', async () => {
  for (const change of [{ $set: { role: 'operations_admin' } }, { $set: { isActive: false } }, null]) {
    const creds = await seedAdminUser({ role: 'admin' });
    const agent = await loginAdminApi(request.agent(app), creds);
    assert.equal((await agent.get(`${API}/me`)).status, 200);
    if (change) await AdminUser.updateOne({ _id: creds.user._id }, change);
    else await AdminUser.deleteOne({ _id: creds.user._id });
    assertEnvelope(await agent.get(`${API}/me`), 401, 'unauthenticated');
    assert.equal((await bootstrap(agent)).authenticated, false);
    // restoring the account does not resurrect the destroyed session
    if (change) await AdminUser.updateOne({ _id: creds.user._id }, { $set: { role: 'admin', isActive: true } });
    assert.equal((await agent.get(`${API}/me`)).status, 401);
    // …and it is dead for the EJS console too: one CMS session, one live check
    assert.equal((await agent.get('/admin')).headers.location, '/admin/login');
  }
});

test('logout: needs the session token, is audited, ends the session, and is harmless when already signed out', async () => {
  const creds = await seedAdminUser({ role: 'admin' });
  const agent = await loginAdminApi(request.agent(app), creds);
  assertEnvelope(await agent.bare.post(`${API}/session/logout`).set('Origin', ORIGIN), 403, 'csrf_invalid');
  assert.equal((await agent.get(`${API}/me`)).status, 200);
  const out = await agent.post(`${API}/session/logout`);
  assert.deepEqual(out.body.data, { signedOut: true });
  assert.ok(await SecurityEvent.findOne({ type: 'logout', actorAdmin: creds.user._id, surface: 'admin_cms' }));
  assert.equal((await agent.get(`${API}/me`)).status, 401);
  assert.equal((await agent.bare.post(`${API}/session/logout`)).status, 200);
});

test('boundary: a Staff session is not an Admin identity, a CMS session is not a Staff identity, a Client cookie is nothing', async () => {
  const creds = await seedAdminUser({ role: 'super_admin' });
  const staff = await loginStaffAs(request.agent(app), creds);
  assert.equal((await staff.get('/api/v1/staff/me')).status, 200);
  assertEnvelope(await staff.get(`${API}/me`), 401, 'unauthenticated');
  assert.equal((await bootstrap(staff)).authenticated, false);

  const admin = await loginAdminApi(request.agent(app), creds);
  assert.equal((await admin.get(`${API}/me`)).status, 200);
  assert.equal((await admin.get('/api/v1/staff/me')).status, 401);

  const client = await request(app).get(`${API}/me`).set('Cookie', ['ih_portal_session=any-client-token', 'ih_staff_session=any-staff-token']);
  assertEnvelope(client, 401, 'unauthenticated');
});

test('CSRF: sign-in and every mutation need the session token and a trusted same-origin request, refused in JSON', async () => {
  const creds = await seedAdminUser({ role: 'admin' });
  const agent = request.agent(app);
  const token = (await bootstrap(agent)).csrfToken;

  assertEnvelope(await login(agent, null, creds), 403, 'csrf_invalid');
  assertEnvelope(await login(agent, 'x'.repeat(token.length), creds), 403, 'csrf_invalid');
  assertEnvelope(await login(agent, token, creds, null), 403, 'csrf_invalid');
  assertEnvelope(await login(agent, token, creds, 'https://evil.example'), 403, 'csrf_invalid');
  assertEnvelope(await login(agent, token, creds, 'https://admin.immigrationhorizons.com.evil.example'), 403, 'csrf_invalid');
  // another session's token is not this session's token
  assertEnvelope(await login(agent, (await bootstrap(request.agent(app))).csrfToken, creds), 403, 'csrf_invalid');
  assert.equal((await agent.get(`${API}/me`)).status, 401);
  const reasons = (await SecurityEvent.find({ type: 'csrf_rejected', surface: 'admin_cms' })).map((e) => e.meta.reason).sort();
  assert.deepEqual(reasons, ['bad_token', 'bad_token', 'bad_token', 'missing_origin', 'untrusted_origin', 'untrusted_origin']);
  assert.equal((await login(agent, token, creds)).status, 200);
});

test('trusted origin: the request host or ADMIN_URL, with localhost allowed only outside production', () => {
  const prod = { NODE_ENV: 'production', ADMIN_URL: 'https://admin.immigrationhorizons.com' };
  assert.equal(isTrustedAdminOrigin('https://admin.immigrationhorizons.com', 'admin.immigrationhorizons.com', prod), true);
  assert.equal(isTrustedAdminOrigin('https://admin.immigrationhorizons.com/x', '127.0.0.1:4000', prod), true, 'ADMIN_URL covers a proxy that rewrites Host');
  assert.equal(isTrustedAdminOrigin('https://app.immigrationhorizons.com', 'admin.immigrationhorizons.com', prod), false, 'the Staff/Client host is a different origin');
  assert.equal(isTrustedAdminOrigin('https://evilimmigrationhorizons.com', 'admin.immigrationhorizons.com', prod), false);
  assert.equal(isTrustedAdminOrigin('http://localhost:4200', 'admin.immigrationhorizons.com', prod), false);
  assert.equal(isTrustedAdminOrigin('http://localhost:4200', '127.0.0.1:4000', { NODE_ENV: 'development' }), true);
  assert.equal(isTrustedAdminOrigin('javascript:alert(1)', 'x', {}), false);
  assert.equal(isTrustedAdminOrigin('not a url', 'x', {}), false);
});

test('break-glass: the environment credential opens the EJS console only, never the Admin API', async () => {
  const agent = request.agent(app);
  const token = (await bootstrap(agent)).csrfToken;
  assertEnvelope(await login(agent, token, { email: 'breakglass', password: 'Break-Glass-Only-1!' }), 401, 'unauthenticated');

  const ejs = request.agent(app);
  const formToken = await readCsrfToken(ejs, '/admin/login');
  const res = await ejs.post('/admin/login').type('form').send({ username: 'breakglass', password: 'Break-Glass-Only-1!', _csrf: formToken });
  assert.equal(res.status, 302);
  assert.equal((await ejs.get('/admin')).status, 200, 'the legacy fallback still works');
  assert.equal((await bootstrap(ejs)).authenticated, false);
  assertEnvelope(await ejs.get(`${API}/me`), 401, 'unauthenticated');
  assert.equal((await ejs.get('/admin')).status, 200, 'being refused by the API does not end the recovery session');
});

test('legacy EJS: a DB-backed login still works through the shared service and shares the one CMS session with the API', async () => {
  const creds = await seedAdminUser({ role: 'editor' });
  const ejs = await loginAs(request.agent(app), creds);
  assert.equal((await ejs.get('/admin')).status, 200);
  assert.equal((await ejs.get(`${API}/me`)).body.data.email, creds.email);
  assert.equal((await SecurityEvent.findOne({ type: 'login_succeeded', actorAdmin: creds.user._id })).meta.via, undefined);
});

test('errors: unknown routes and unparseable bodies answer with the JSON envelope, never HTML', async () => {
  const agent = await loginAdminApi(request.agent(app), await seedAdminUser({ role: 'admin' }));
  assertEnvelope(await agent.get(`${API}/no-such-thing`), 404, 'not_found');
  assertEnvelope(await request(app).get(`${API}/no-such-thing`), 401, 'unauthenticated');
  const bad = await agent.post(`${API}/session/login`).set('Content-Type', 'application/json').send('{"email":');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'invalid_request');
  assert.doesNotMatch(JSON.stringify(bad.body), /SyntaxError|at JSON/);
});

test('the web app never loads .env on its own: only server.js and the CLI scripts may', () => {
  // A module that calls dotenv.config() when required would point this very test process at the real database.
  const loaded = Object.keys(require.cache).filter((file) => /node_modules[\\/]dotenv[\\/]/.test(file));
  assert.deepEqual(loaded, []);
});
