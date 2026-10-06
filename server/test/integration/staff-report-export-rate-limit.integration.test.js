/** Export rate limit (ADR-028): exports are far stricter than interactive reads. */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
process.env.REPORT_EXPORT_RATE_LIMIT = '2';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');
const { staffAgent } = require('../helpers/searchReportFixtures');

let app;
test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

test('the third export in a minute is a 429; reading the report on screen is not limited by it', async () => {
  const pm = await staffAgent(app, 'pm');
  const other = await staffAgent(app, 'pm');
  for (let i = 0; i < 2; i += 1) assert.equal((await pm.agent.get('/api/v1/staff/reports/export.csv?report=review-queues')).status, 200);
  const limited = await pm.agent.get('/api/v1/staff/reports/export.csv?report=review-queues');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'rate_limited');
  assert.equal((await pm.agent.get('/api/v1/staff/reports/review-queues')).status, 200);
  assert.equal((await other.agent.get('/api/v1/staff/reports/export.csv?report=review-queues')).status, 200);
});
