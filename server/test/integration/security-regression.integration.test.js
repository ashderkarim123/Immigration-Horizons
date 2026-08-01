// See auth.integration.test.js for why this must be set before `../../app`
// is first required.
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');

const { createApp } = require('../../app');
const Consultation = require('../../models/Consultation');

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

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return agent;
}

// ---------------------------------------------------------------------------
// 1. Search-page XSS escaping, at response-body level (Phase 1.5 regression)
// ---------------------------------------------------------------------------

test('search results: a lead name containing a script payload is escaped in the rendered HTML', async () => {
  const agent = await loggedInAs('admin');
  const payload = '<script>alert(document.cookie)</script>';
  await Consultation.create({
    name: payload,
    email: 'xss@example.com',
    message: 'test',
    service: 'EB-2 NIW',
  });

  const res = await agent.get('/admin/search').query({ q: 'alert' });
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes(payload), 'raw <script> payload must never appear unescaped in the response body');
  assert.ok(res.text.includes('&lt;script&gt;'), 'the payload must appear HTML-entity-escaped');
});

test('search results: an event-handler XSS payload in an email field is escaped', async () => {
  const agent = await loggedInAs('admin');
  const payload = 'x@x.com" onmouseover="alert(1)';
  await Consultation.create({
    name: 'Payload Carrier',
    email: payload,
    message: 'test',
    service: 'EB-2 NIW',
  });

  const res = await agent.get('/admin/search').query({ q: 'Payload Carrier' });
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes('onmouseover="alert(1)"'), 'unescaped attribute-breakout payload must not appear');
});

// ---------------------------------------------------------------------------
// 2. CSV formula-injection sanitization (Phase 2 regression)
// ---------------------------------------------------------------------------

test('CSV export: a lead name starting with "=" is neutralized, not exported as a live formula', async () => {
  const agent = await loggedInAs('admin');
  await Consultation.create({
    name: '=HYPERLINK("http://evil.example","click me")',
    email: 'formula@example.com',
    message: 'test',
    service: 'EB-2 NIW',
  });

  const res = await agent.get('/admin/leads/export/csv');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('"\'=HYPERLINK'), 'a leading-quote-neutralized formula cell must be present');
  assert.ok(!/(^|\n)=HYPERLINK/.test(res.text), 'no CSV line may start with a live "=" formula');
});

// ---------------------------------------------------------------------------
// 3. A viewer attempting a destructive action (belt-and-suspenders alongside
//    auth.integration.test.js's broader viewer sweep)
// ---------------------------------------------------------------------------

test('viewer attempting to delete a lead is denied and the record survives', async () => {
  const agent = await loggedInAs('viewer');
  const lead = await Consultation.create({ name: 'Survivor', email: 'a@b.com', message: 'x', service: 'EB-2 NIW' });

  const res = await agent.delete(`/admin/leads/${lead._id}`);
  assert.equal(res.status, 403);
  assert.ok(await Consultation.findById(lead._id));
});

// ---------------------------------------------------------------------------
// 4. Invalid MongoDB ObjectIds must not produce an unhandled 500
// ---------------------------------------------------------------------------

test('an invalid ObjectId in the URL never produces an unhandled 500', async () => {
  const agent = await loggedInAs('admin');
  const invalidId = 'not-a-valid-object-id';

  const getRes = await agent.get(`/admin/leads/${invalidId}`);
  assert.notEqual(getRes.status, 500, `GET /admin/leads/:id must not 500 on an invalid id (got ${getRes.status})`);

  const statusRes = await agent.post(`/admin/leads/${invalidId}/status`).send({ status: 'contacted' });
  assert.notEqual(statusRes.status, 500, `POST .../status must not 500 on an invalid id (got ${statusRes.status})`);

  const deleteRes = await agent.delete(`/admin/leads/${invalidId}`);
  assert.notEqual(deleteRes.status, 500, `DELETE /admin/leads/:id must not 500 on an invalid id (got ${deleteRes.status})`);
});
