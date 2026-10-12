// The limiters read their limits when the route module loads, so this lives in its own process.
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.MAIL_SEND_RATE_LIMIT = '2';
process.env.MAIL_READ_RATE_LIMIT = '3';
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { ORIGIN, staffAgent } = require('../helpers/searchReportFixtures');
const fake = require('../helpers/fakeGraph');

let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(async () => { fake.uninstall(); fake.clearConfig(); await stopTestDb(); });
test.beforeEach(async () => { await clearCollections(); fake.useConfig(); fake.install(); });

test('sending and reading are throttled per employee, with the standard envelope, and one employee does not throttle another', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const send = () => agent.post('/api/v1/staff/mail/messages').set('Origin', ORIGIN).send({ to: ['a@b.co'], subject: 's', body: 'b' });
  assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 201);
  const limited = await send();
  assert.deepEqual([limited.status, limited.body.error.code], [429, 'rate_limited']);

  for (let i = 0; i < 3; i += 1) assert.equal((await agent.get('/api/v1/staff/mail/messages')).status, 200);
  assert.equal((await agent.get('/api/v1/staff/mail/messages')).status, 429);

  const { agent: other } = await staffAgent(app, 'admin');
  assert.equal((await other.get('/api/v1/staff/mail/messages')).status, 200);
});
