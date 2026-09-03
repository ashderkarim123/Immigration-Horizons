// Must be set before `../../app` is first required — see the note in
// auth.integration.test.js. This suite deliberately drives the login route
// far more often than the production limiter allows.
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, readCsrfToken } = require('../helpers/auth');

const { createApp } = require('../../app');
const AdminUser = require('../../models/admin/User');
const SecurityEvent = require('../../models/SecurityEvent');
const { MAX_FAILED_LOGIN_ATTEMPTS } = require('../../utils/lockout');

/**
 * Admin-CMS half of the security audit and lockout tests (ADR-012 §2, §3).
 *
 * The root app's test/security-audit.integration.test.ts covers the portal
 * and staff surfaces. The pair matters because the lockout counters live on
 * a record BOTH applications authenticate against — a lock applied here has
 * to be honoured there and vice versa, which is asserted at the bottom.
 */

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

/** Submits the login form properly, token and all. */
async function attemptLogin(agent, { username, password }) {
  const token = await readCsrfToken(agent, '/admin/login');
  return agent.post('/admin/login').type('form').send({ username, password, _csrf: token });
}

async function events(filter = {}) {
  return SecurityEvent.find(filter).sort({ createdAt: 1 }).lean();
}

// ---------------------------------------------------------------------------
// Authentication is recorded
// ---------------------------------------------------------------------------

test('a successful admin login is recorded against the AdminUser', async () => {
  const { user, email, password } = await seedAdminUser({ role: 'pm' });

  const res = await attemptLogin(request.agent(app), { username: email, password });
  assert.equal(res.status, 302);

  const [event] = await events({ type: 'login_succeeded' });
  assert.equal(event.surface, 'admin_cms');
  assert.equal(event.actorType, 'admin_user');
  assert.equal(String(event.actorAdmin), String(user._id));
  assert.equal(event.subjectEmail, email.toLowerCase());
  assert.equal(event.meta.role, 'pm');
});

test('the break-glass env credential is recorded as env_fallback, not as a person', async () => {
  process.env.ADMIN_USERNAME = 'breakglass';
  process.env.ADMIN_PASSWORD = 'breakglass-password';
  try {
    const res = await attemptLogin(request.agent(app), {
      username: 'breakglass',
      password: 'breakglass-password',
    });
    assert.equal(res.status, 302);

    const [event] = await events({ type: 'login_succeeded' });
    assert.equal(event.actorType, 'env_fallback');
    assert.equal(event.actorAdmin, null, 'there is no person to attribute this to');
    assert.equal(event.meta.reason, 'env_credential_fallback');
  } finally {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  }
});

test('an admin logout is recorded', async () => {
  const { user, email, password } = await seedAdminUser({ role: 'admin' });
  const agent = request.agent(app);
  await attemptLogin(agent, { username: email, password });

  const token = await readCsrfToken(agent, '/admin');
  const res = await agent.post('/admin/logout').type('form').send({ _csrf: token });
  assert.equal(res.status, 302);

  const [event] = await events({ type: 'logout' });
  assert.equal(String(event.actorAdmin), String(user._id));
  assert.equal(event.surface, 'admin_cms');
});

test('a failed admin login records the reason without telling the caller', async () => {
  const { email, password } = await seedAdminUser({ role: 'pm' });

  const unknown = await attemptLogin(request.agent(app), {
    username: 'nobody@example.invalid',
    password,
  });
  const wrongPassword = await attemptLogin(request.agent(app), {
    username: email,
    password: 'not-the-password',
  });

  assert.equal(unknown.status, 200);
  assert.equal(wrongPassword.status, 200);
  assert.match(unknown.text, /Invalid username or password/);
  assert.match(wrongPassword.text, /Invalid username or password/);

  const failures = await events({ type: 'login_failed' });
  assert.deepEqual(
    failures.map((e) => e.meta.reason),
    ['no_such_account', 'bad_password']
  );
});

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

test('an admin account locks after the threshold and then refuses the right password', async () => {
  const { user, email, password } = await seedAdminUser({ role: 'pm' });

  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
    await attemptLogin(request.agent(app), { username: email, password: 'wrong' });
  }

  const locked = await AdminUser.findById(user._id).lean();
  assert.ok(locked.lockedUntil, 'the account should be locked');

  const res = await attemptLogin(request.agent(app), { username: email, password });
  assert.equal(res.status, 200, 'a locked account must not be redirected in');
  assert.match(res.text, /Invalid username or password/);

  const [lock] = await events({ type: 'account_locked' });
  assert.equal(lock.surface, 'admin_cms');
  assert.equal(String(lock.actorAdmin), String(user._id));
});

test('a lock applied in the admin CMS is honoured by the SaaS staff app, and vice versa', async () => {
  // Both applications read and write the same two fields on the same row.
  // This asserts the shared state directly rather than booting the Next.js
  // app inside this suite: the staff route's own half of this behaviour is
  // covered by test/security-audit.integration.test.ts in the root app.
  const { user, email, password } = await seedAdminUser({ role: 'pm' });

  for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
    await attemptLogin(request.agent(app), { username: email, password: 'wrong' });
  }

  const row = await AdminUser.findById(user._id).lean();
  assert.ok(row.lockedUntil instanceof Date);
  assert.ok(row.lockedUntil.getTime() > Date.now(), 'the lock must still be in the future');
  assert.equal(row.failedLoginCount, 0, 'the counter resets so the lock is a delay, not permanent');

  // Clearing the lock the way a successful sign-in on either app would.
  await AdminUser.updateOne({ _id: user._id }, { $set: { lockedUntil: null, failedLoginCount: 0 } });
  const res = await attemptLogin(request.agent(app), { username: email, password });
  assert.equal(res.status, 302);
});

test('a legacy row with an off-enum role can still sign in and be locked', async () => {
  // Regression: writing the lockout counters with document.save() would
  // re-validate the whole document, so one legacy row with a role outside
  // the enum would stop being able to log in at all. The counters are
  // written with updateOne precisely so that cannot happen.
  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const password = 'Test-Password-123!';
  const email = 'legacy-role@test.immigrationhorizons.invalid';

  await mongoose.connection.collection('adminusers').insertOne({
    name: 'Legacy Row',
    email,
    password: await bcrypt.hash(password, 10),
    role: 'role_that_is_not_in_the_enum',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const ok = await attemptLogin(request.agent(app), { username: email, password });
  assert.equal(ok.status, 302, 'an off-enum role must not break authentication itself');

  const bad = await attemptLogin(request.agent(app), { username: email, password: 'wrong' });
  assert.equal(bad.status, 200);

  const row = await mongoose.connection.collection('adminusers').findOne({ email });
  assert.equal(row.failedLoginCount, 1, 'the counter must still have been written');
});

// ---------------------------------------------------------------------------
// What the log must never contain
// ---------------------------------------------------------------------------

test('no admin security event contains a password or the session cookie', async () => {
  const { email, password } = await seedAdminUser({ role: 'admin' });
  const agent = request.agent(app);

  await attemptLogin(agent, { username: email, password: 'wrong-guess-value' });
  await attemptLogin(agent, { username: email, password });

  const serialized = JSON.stringify(await events());
  assert.equal(serialized.includes(password), false);
  assert.equal(serialized.includes('wrong-guess-value'), false);
  assert.equal(serialized.includes('connect.sid'), false);
});

test('the log records the caller IP and user agent for incident response', async () => {
  const { email, password } = await seedAdminUser({ role: 'admin' });
  const agent = request.agent(app);
  const token = await readCsrfToken(agent, '/admin/login');

  await agent
    .post('/admin/login')
    .type('form')
    .set('x-forwarded-for', '203.0.113.9, 70.41.3.18')
    .set('user-agent', 'Mozilla/5.0 (Test Harness)')
    .send({ username: email, password, _csrf: token });

  const [event] = await events({ type: 'login_succeeded' });
  assert.equal(event.ip, '203.0.113.9', 'only the client-most hop is kept');
  assert.equal(event.userAgent, 'Mozilla/5.0 (Test Harness)');
});
