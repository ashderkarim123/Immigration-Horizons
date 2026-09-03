// Must be set before `../../app` (and therefore routes/admin/index.js, where
// the login rate limiter is constructed) is first required — this suite logs
// in through the real route many times, all from the same loopback IP.
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, readCsrfToken } = require('../helpers/auth');

const { createApp } = require('../../app');
const Consultation = require('../../models/Consultation');
const SecurityEvent = require('../../models/SecurityEvent');

/**
 * CSRF regression tests for the admin CMS (ADR-012 §5).
 *
 * The point of this file is the enumeration test at the bottom: it walks
 * every mutating route the Express router actually declares and asserts
 * each one refuses a tokenless request. That is what catches a route added
 * later that slips past the global middleware — most plausibly a multipart
 * route that reaches for a bare `upload.single()` instead of
 * `uploadSingle()`, since those are the ones verified after multer rather
 * than before the handler.
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

async function seedLead() {
  return Consultation.create({
    name: 'CSRF Test Lead',
    email: 'csrf-lead@test.invalid',
    message: 'seed',
    service: 'EB-2 NIW',
  });
}

/** An authenticated agent that has NOT been decorated with a token. */
async function bareLoggedInAgent(role = 'super_admin') {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  const loginToken = await readCsrfToken(agent, '/admin/login');
  const res = await agent
    .post('/admin/login')
    .type('form')
    .send({ username: creds.email, password: creds.password, _csrf: loginToken });
  assert.equal(res.status, 302, 'setup: login should have succeeded');
  return agent;
}

// ---------------------------------------------------------------------------
// The token itself
// ---------------------------------------------------------------------------

test('every rendered admin form carries a token, and it is not the empty string', async () => {
  const agent = await bareLoggedInAgent();
  const token = await readCsrfToken(agent, '/admin');
  assert.ok(token.length > 20, `token looked too short to be random: ${JSON.stringify(token)}`);
});

test('the login page issues a token before anyone is authenticated', async () => {
  const token = await readCsrfToken(request.agent(app), '/admin/login');
  assert.ok(token.length > 20);
});

test('logging in rotates the token, so one harvested pre-login cannot be replayed', async () => {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role: 'super_admin' });

  const preLoginToken = await readCsrfToken(agent, '/admin/login');
  await agent
    .post('/admin/login')
    .type('form')
    .send({ username: creds.email, password: creds.password, _csrf: preLoginToken });

  const postLoginToken = await readCsrfToken(agent, '/admin');
  assert.notEqual(
    postLoginToken,
    preLoginToken,
    'session.regenerate() must discard the pre-login token'
  );

  // And the old one must actually be refused, not merely different.
  const lead = await seedLead();
  const res = await agent
    .post(`/admin/leads/${lead._id}/status`)
    .type('form')
    .send({ status: 'contacted', _csrf: preLoginToken });
  assert.equal(res.status, 403);
});

test('two different sessions never share a token', async () => {
  const a = await readCsrfToken(request.agent(app), '/admin/login');
  const b = await readCsrfToken(request.agent(app), '/admin/login');
  assert.notEqual(a, b);
});

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

test('an authenticated mutation with no token is refused and changes nothing', async () => {
  const agent = await bareLoggedInAgent();
  const lead = await seedLead();

  const res = await agent.post(`/admin/leads/${lead._id}/status`).type('form').send({ status: 'contacted' });

  assert.equal(res.status, 403);
  const unchanged = await Consultation.findById(lead._id);
  assert.equal(unchanged.status, 'new', 'the mutation must not have been applied');
});

test('a token from another session is refused', async () => {
  const victim = await bareLoggedInAgent();
  const attackerToken = await readCsrfToken(request.agent(app), '/admin/login');
  const lead = await seedLead();

  const res = await victim
    .post(`/admin/leads/${lead._id}/status`)
    .type('form')
    .send({ status: 'contacted', _csrf: attackerToken });

  assert.equal(res.status, 403);
  assert.equal((await Consultation.findById(lead._id)).status, 'new');
});

test('a truncated token is refused rather than crashing the length-sensitive compare', async () => {
  const agent = await bareLoggedInAgent();
  const token = await readCsrfToken(agent, '/admin');
  const lead = await seedLead();

  for (const bad of ['', token.slice(0, -1), `${token}x`, 'not-a-token']) {
    const res = await agent
      .post(`/admin/leads/${lead._id}/status`)
      .type('form')
      .send({ status: 'contacted', _csrf: bad });
    assert.equal(res.status, 403, `token ${JSON.stringify(bad)} should have been refused`);
  }
  assert.equal((await Consultation.findById(lead._id)).status, 'new');
});

test('a valid token lets the same mutation through', async () => {
  const agent = await bareLoggedInAgent();
  const token = await readCsrfToken(agent, '/admin');
  const lead = await seedLead();

  const res = await agent
    .post(`/admin/leads/${lead._id}/status`)
    .type('form')
    .send({ status: 'contacted', _csrf: token });

  assert.equal(res.status, 302);
  assert.equal((await Consultation.findById(lead._id)).status, 'contacted');
});

test('login itself is protected — a tokenless login POST is refused', async () => {
  const creds = await seedAdminUser({ role: 'super_admin' });
  const res = await request
    .agent(app)
    .post('/admin/login')
    .type('form')
    .send({ username: creds.email, password: creds.password });

  assert.equal(res.status, 403, 'login CSRF forces a victim into an attacker-chosen session');
});

test('an UNauthenticated mutation still redirects to login rather than dead-ending on 403', async () => {
  // Deliberate: every /admin/* mutation except login sits behind
  // requireAdmin, so an unauthenticated one cannot change state and the
  // useful response is "go and sign in".
  const lead = await seedLead();
  const res = await request(app).post(`/admin/leads/${lead._id}/status`).type('form').send({ status: 'contacted' });

  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/admin\/login/);
  assert.equal((await Consultation.findById(lead._id)).status, 'new');
});

test('a refusal is recorded as a csrf_rejected security event', async () => {
  const agent = await bareLoggedInAgent();
  const lead = await seedLead();

  await agent.post(`/admin/leads/${lead._id}/status`).type('form').send({ status: 'contacted' });

  // The recorder is fire-and-forget, so give it a tick to land.
  await new Promise((resolve) => setTimeout(resolve, 150));

  const events = await SecurityEvent.find({ type: 'csrf_rejected' }).lean();
  assert.equal(events.length, 1);
  assert.equal(events[0].result, 'denied');
  assert.equal(events[0].surface, 'admin_cms');
  assert.equal(events[0].actorType, 'admin_user');
  assert.match(events[0].meta.path, /\/status$/);
});

// ---------------------------------------------------------------------------
// Coverage — the test that catches a route escaping the middleware
// ---------------------------------------------------------------------------

test('EVERY mutating admin route refuses a tokenless request', async () => {
  const agent = await bareLoggedInAgent();

  // Walk the real router's stack rather than a hand-maintained list, so a
  // route added later is covered the day it is added.
  const routes = [];
  const walk = (stack) => {
    stack.forEach((layer) => {
      if (layer.route) {
        const path = layer.route.path;
        Object.keys(layer.route.methods)
          .filter((m) => ['post', 'put', 'patch', 'delete'].includes(m))
          .forEach((method) => routes.push({ method, path }));
      } else if (layer.handle && layer.handle.stack) {
        walk(layer.handle.stack);
      }
    });
  };
  walk(app._router.stack);

  assert.ok(routes.length > 40, `expected to find the admin's mutating routes, found ${routes.length}`);

  const escaped = [];
  for (const { method, path } of routes) {
    // Logout is exempt by design: it only destroys the caller's own
    // session, so forcing it cannot alter data — and it is the one place a
    // 403 would be actively unhelpful.
    if (path === '/admin/logout') continue;

    // Substitute a syntactically valid ObjectId for every :param so the
    // request reaches the handler rather than dying in the router.
    const url = path.replace(/:[A-Za-z0-9_]+/g, '0123456789abcdef01234567');

    const res = await agent[method](url).type('form').send({});

    // 403 is the CSRF refusal. Anything else means the request got past
    // the middleware — which is the failure this test exists to catch.
    if (res.status !== 403) escaped.push(`${method.toUpperCase()} ${path} -> ${res.status}`);
  }

  assert.deepEqual(escaped, [], `these mutating routes accepted a tokenless request:\n${escaped.join('\n')}`);
});
