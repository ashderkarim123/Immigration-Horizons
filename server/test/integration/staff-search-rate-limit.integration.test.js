/** Search rate limit (ADR-028): a debounced interactive session fits, abuse does not, and one employee never throttles another. */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
process.env.STAFF_SEARCH_RATE_LIMIT = '4';
process.env.SEARCH_TELEMETRY_SILENT = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');
const AdminUser = require('../../models/admin/User');

const ORIGIN = 'http://localhost:4000';
let app;
test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function agentFor(role, n) {
  const email = `${role}${n}@ih.test`;
  await AdminUser.create({ name: `Staff ${n}`, email, password: 'Password123!', role, isActive: true, mustChangePassword: false });
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: 'Password123!' })).status, 200);
  return agent;
}

test('the limit applies per employee: the next search is a 429 envelope, and another employee is unaffected', async () => {
  const first = await agentFor('pm', 1);
  const second = await agentFor('pm', 2);
  for (let i = 0; i < 4; i += 1) assert.equal((await first.get('/api/v1/staff/search?q=anything')).status, 200, `request ${i + 1}`);
  const limited = await first.get('/api/v1/staff/search?q=anything');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'rate_limited');
  assert.ok(limited.headers['ratelimit-limit'] || limited.headers.ratelimit, 'standard rate-limit headers are sent');
  assert.equal((await second.get('/api/v1/staff/search?q=anything')).status, 200);
});
