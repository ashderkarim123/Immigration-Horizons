process.env.LOGIN_RATE_LIMIT = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginStaffAs } = require('../helpers/auth');
const Lead = require('../../models/Consultation');
const ActivityLog = require('../../models/admin/ActivityLog');
const { resolveStage, mongoStageExpression, STAGES } = require('../../services/crmPipeline');

let app;
let seq = 0;
const createLead = (overrides = {}) => Lead.create({
  name: 'Prospect', email: 'prospect-' + ++seq + '@example.test',
  message: 'Consultation inquiry', service: 'EB-2 NIW', ...overrides,
});
async function as(role) {
  const credentials = await seedAdminUser({ role });
  return { user: credentials.user, agent: await loginStaffAs(request.agent(app), credentials) };
}
const url = (id) => '/api/v1/staff/crm/leads/' + id;

test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

test('projection is separate from operational status; ten stages and historical nulls', async () => {
  assert.equal(STAGES.length, 10);
  assert.equal(resolveStage({ status: 'new' }), 'new');
  assert.equal(resolveStage({ status: 'in_progress' }), 'decision_pending');
  assert.equal(resolveStage({ status: 'closed' }), 'decision_pending');
  assert.equal(resolveStage({ status: 'closed', convertedCase: new mongoose.Types.ObjectId() }), 'client_created');
  assert.equal(resolveStage({ status: 'submitted', crmStage: 'lost' }), 'lost');
  assert.ok(mongoStageExpression().$ifNull);
});

test('board counts every accessible lead including historical values and bounds cards per stage', async () => {
  const admin = await as('admin');
  await createLead({ name: 'Old closed', status: 'closed' });
  await createLead({ name: 'Old contact', status: 'contacted' });
  await createLead({ name: 'Converted', status: 'submitted', convertedCase: new mongoose.Types.ObjectId() });
  for (let i = 0; i < 16; i++) await createLead({ name: 'New ' + i });
  const res = await admin.agent.get('/api/v1/staff/crm/board');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const data = res.body.data;
  assert.equal(data.total, 19);
  assert.equal(data.stages.length, 10);
  assert.deepEqual(data.stages.map(s => s.value), STAGES.map(s => s.value));
  const stage = key => data.stages.find(s => s.value === key);
  assert.equal(stage('new').total, 16);
  assert.equal(stage('new').items.length, 15);
  assert.equal(stage('new').truncated, true);
  assert.equal(stage('decision_pending').total, 1);
  assert.equal(stage('contacted').total, 1);
  assert.equal(stage('client_created').total, 1);
  assert.equal(await Lead.countDocuments({ crmStage: { $ne: null } }), 0, 'read-time board must not backfill CRM fields');
});

test('manager can save stage, loss reason, follow-up and indicative quote without changing operational status', async () => {
  const pm = await as('pm');
  const lead = await createLead({ status: 'in_progress' });
  assert.equal((await pm.agent.patch(url(lead.id)).send({ stage: 'lost' })).status, 422);
  const changes = { stage: 'lost', lostReason: 'timing',
    followUpAt: '2026-11-10T14:30:00.000Z',
    quote: { amountMinor: 125050, currency: 'USD', note: 'Indicative only' } };
  const result = await pm.agent.patch(url(lead.id)).send(changes);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.stage, 'lost');
  const saved = await Lead.findById(lead.id);
  assert.equal(saved.status, 'in_progress');
  assert.equal(saved.crmLostReason, 'timing');
  assert.equal(saved.crmQuote.amountMinor, 125050);
  assert.equal(saved.crmNextFollowUpAt.toISOString(), changes.followUpAt);
  assert.ok(await ActivityLog.exists({ lead: lead.id, type: 'status_changed' }));
  const reset = await pm.agent.patch(url(lead.id)).send({ stage: 'contacted', lostReason: null, quote: null, followUpAt: null });
  assert.equal(reset.status, 200);
  assert.equal((await Lead.findById(lead.id)).crmLostReason, null);
});

test('invalid stage, fake case conversion, quote shape, date and mass assignment are denied', async () => {
  const pm = await as('pm');
  const lead = await createLead({ status: 'new' });
  for (const patch of [
    { stage: 'finished' },
    { stage: 'client_created' },
    { stage: 'lost', lostReason: 'anything' },
    { stage: 'contacted', lostReason: 'budget' },
    { quote: { amountMinor: -1, currency: 'USD' } },
    { quote: { amountMinor: 100.5, currency: 'USD' } },
    { quote: { amountMinor: 100, currency: 'XMR' } },
    { followUpAt: 'tomorrow' },
    { stage: 'contacted', status: 'closed' },
  ]) {
    const res = await pm.agent.patch(url(lead.id)).send(patch);
    assert.equal(res.status, 422, JSON.stringify({ patch, response: res.body }));
  }
  assert.equal((await Lead.findById(lead.id)).status, 'new');
  assert.equal((await Lead.findById(lead.id)).crmStage, null);
});

test('viewer reads CRM but cannot mutate; non-session and untrusted origin are rejected', async () => {
  const viewer = await as('viewer'), pm = await as('pm');
  const lead = await createLead();
  assert.equal((await viewer.agent.get('/api/v1/staff/crm/board')).status, 200);
  assert.equal((await viewer.agent.patch(url(lead.id)).send({ stage: 'qualified' })).status, 403);
  assert.equal((await request(app).get(url(lead.id))).status, 401);
  assert.equal((await pm.agent.patch(url(lead.id)).set('Origin', 'https://evil.example').send({ stage: 'qualified' })).status, 403);
  assert.equal((await Lead.findById(lead.id)).crmStage, null);
});

test('converted leads are concealed from a non-member, including duplicate suggestion lookups', async () => {
  const viewer = await as('viewer');
  const admin = await as('admin');
  const visible = await createLead({ email: 'SAME@sample.test', name: 'Visible' });
  const hidden = await createLead({ email: 'same@sample.test', name: 'Hidden converted', convertedCase: new mongoose.Types.ObjectId() });
  assert.equal((await viewer.agent.get(url(hidden.id))).status, 404);
  assert.equal((await viewer.agent.get(url(hidden.id) + '/duplicates')).status, 404);
  const matches = await viewer.agent.get(url(visible.id) + '/duplicates');
  assert.equal(matches.status, 200);
  assert.equal(matches.body.data.items.length, 0);
  const board = await viewer.agent.get('/api/v1/staff/crm/board');
  assert.equal(board.body.data.total, 1);
  assert.equal((await admin.agent.get(url(visible.id) + '/duplicates')).body.data.items.length, 1);
  assert.equal((await admin.agent.get(url(hidden.id))).status, 200);
});
