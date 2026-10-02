process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');
const { isTrustedHost } = require('../../middleware/api/trustedOrigin');
const AdminUser = require('../../models/admin/User');

/**
 * Release Gate 01 (ADR-024 §7–§9): the canonical staff API as the browser will
 * reach it in production — through nginx on app.immigrationhorizons.com, same
 * origin, no CORS. These requests carry the headers nginx forwards.
 */

const APP_ORIGIN = 'https://app.immigrationhorizons.com';
const PASSWORD = 'Password123!';
let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

/** What the browser's request looks like after nginx (Host preserved, proto forwarded). */
const viaNginx = (req) => req.set('Host', 'app.immigrationhorizons.com').set('X-Forwarded-Proto', 'https').set('X-Forwarded-For', '203.0.113.9');

async function signedInViaAppHost() {
  const email = `cutover-${Date.now()}@ih.test`;
  await AdminUser.create({ name: 'Cutover QA', email, password: PASSWORD, role: 'pm', isActive: true, mustChangePassword: false });
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production'; // the cookie code reads this per request
  try {
    const res = await viaNginx(request(app).post('/api/v1/staff/session/login')).set('Origin', APP_ORIGIN).send({ email, password: PASSWORD });
    return res;
  } finally {
    process.env.NODE_ENV = previous;
  }
}

test('the canonical API answers on the app host path /api/v1 without CORS headers', async () => {
  const health = await viaNginx(request(app).get('/api/v1/health')).set('Origin', APP_ORIGIN);
  assert.equal(health.status, 200);
  assert.equal(health.body.data.status, 'ok');
  assert.equal(health.headers['access-control-allow-origin'], undefined, 'same-origin: the API must not advertise CORS');
  assert.equal(health.headers['access-control-allow-credentials'], undefined);

  const preflight = await viaNginx(request(app).options('/api/v1/staff/session/login')).set('Origin', APP_ORIGIN).set('Access-Control-Request-Method', 'POST');
  assert.equal(preflight.headers['access-control-allow-origin'], undefined, 'no preflight is ever approved');
});

test('login through the app host sets ih_staff_session host-only, Path=/, HttpOnly, SameSite=Lax and Secure', async () => {
  const res = await signedInViaAppHost();
  assert.equal(res.status, 200);
  const cookies = [].concat(res.headers['set-cookie'] || []);
  const session = cookies.find((c) => c.startsWith('ih_staff_session='));
  assert.ok(session, 'the session cookie is set');
  const attributes = session.split(';').map((part) => part.trim());
  assert.ok(attributes.includes('Path=/'));
  assert.ok(attributes.includes('HttpOnly'));
  assert.ok(attributes.includes('SameSite=Lax'));
  assert.ok(attributes.includes('Secure'), 'Secure in production');
  assert.ok(!attributes.some((a) => /^domain=/i.test(a)), 'no Domain attribute: the cookie stays on the app host');
  assert.equal(res.body.data.mustChangePassword, false);
  assert.equal(JSON.stringify(res.body).includes(session.split(';')[0].split('=')[1]), false, 'the token is never in the body');
});

test('a mutation from the app origin is accepted; unrelated and look-alike origins are rejected', async () => {
  const login = await signedInViaAppHost();
  const cookie = [].concat(login.headers['set-cookie']).find((c) => c.startsWith('ih_staff_session=')).split(';')[0];

  const withOrigin = (origin) => {
    const req = viaNginx(request(app).post('/api/v1/staff/session/logout')).set('Cookie', cookie);
    return origin ? req.set('Origin', origin) : req;
  };

  for (const bad of ['https://evil.example', 'https://immigrationhorizons.com.evil.example', 'https://evilimmigrationhorizons.com', 'https://app.immigrationhorizons.com.attacker.io', 'null']) {
    const res = await withOrigin(bad);
    assert.equal(res.status, 403, `${bad} must be refused`);
  }
  assert.equal((await withOrigin(null)).status, 403, 'a mutation with no Origin or Referer is refused');

  const ok = await withOrigin(APP_ORIGIN);
  assert.equal(ok.status, 200, 'the real app origin is accepted');
});

test('trusted-origin accepts only the apex, true subdomains and localhost — never a look-alike', () => {
  for (const good of ['immigrationhorizons.com', 'app.immigrationhorizons.com', 'admin.immigrationhorizons.com', 'localhost', '127.0.0.1']) {
    assert.equal(isTrustedHost(good), true, good);
  }
  for (const bad of ['evilimmigrationhorizons.com', 'immigrationhorizons.com.evil.example', 'app.immigrationhorizons.com.evil.example', 'notimmigrationhorizons.com', '', undefined]) {
    assert.equal(isTrustedHost(bad), false, String(bad));
  }
});

test('the session cookie authenticates the same API through the app host (no bearer token, no URL token)', async () => {
  const login = await signedInViaAppHost();
  const cookie = [].concat(login.headers['set-cookie']).find((c) => c.startsWith('ih_staff_session=')).split(';')[0];

  const me = await viaNginx(request(app).get('/api/v1/staff/me')).set('Cookie', cookie);
  assert.equal(me.status, 200);
  const anonymous = await viaNginx(request(app).get('/api/v1/staff/me'));
  assert.equal(anonymous.status, 401);
  const bearer = await viaNginx(request(app).get('/api/v1/staff/me')).set('Authorization', `Bearer ${cookie.split('=')[1]}`);
  assert.equal(bearer.status, 401, 'the token is only honoured as the HttpOnly cookie');
});
