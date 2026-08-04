const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const ConsultationInteraction = require('../models/ConsultationInteraction');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const Consultation = require('../models/Consultation');
const { loadQueue, queueCounts } = require('../services/interactionQueues');
const { generateInteractionNumber } = require('../utils/interactionNumber');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function seedClient() {
  const email = `queue-${Date.now()}-${Math.random()}@example.com`;
  return ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', status: 'active' });
}

async function seedInteraction(overrides = {}) {
  const client = overrides.clientUser || (await seedClient());
  const consultation =
    overrides.consultation ||
    (await Consultation.create({ name: 'Q', email: 'q@example.com', message: 'x'.repeat(20), clientUser: client._id }));
  return ConsultationInteraction.create({
    interactionNumber: generateInteractionNumber(),
    scopeType: 'consultation',
    clientUser: client._id,
    consultation: consultation._id,
    subject: 'Subject',
    description: 'Description long enough.',
    type: 'follow_up_query',
    createdByType: 'client',
    ...overrides,
  });
}

test('unanswered queue includes active statuses and excludes answered/closed/cancelled', async () => {
  await seedInteraction({ status: 'submitted' });
  await seedInteraction({ status: 'in_progress' });
  const answeredAdmin = await AdminUser.create({ name: 'A', email: `qa-${Date.now()}@example.com`, password: 'x', role: 'admin' });
  await seedInteraction({ status: 'answered', answeredAt: new Date(), answeredBy: answeredAdmin._id, clientVisibleResponse: 'x' });
  await seedInteraction({ status: 'cancelled', cancelledAt: new Date() });

  const result = await loadQueue('unanswered');
  assert.equal(result.total, 2);
});

test('unassigned queue excludes interactions with an assignee', async () => {
  const admin = await AdminUser.create({ name: 'Assignee', email: `qb-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  await seedInteraction({ status: 'submitted' });
  await seedInteraction({ status: 'submitted', assignedTo: admin._id });

  const result = await loadQueue('unassigned');
  assert.equal(result.total, 1);
});

test('awaitingScheduling queue includes submitted/acknowledged with no scheduledFor', async () => {
  await seedInteraction({ status: 'submitted' });
  await seedInteraction({ status: 'acknowledged' });
  await seedInteraction({
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 86400000),
    timezone: 'UTC',
  });

  const result = await loadQueue('awaitingScheduling');
  assert.equal(result.total, 2);
});

test('scheduledToday queue only includes interactions scheduled within today (org timezone)', async () => {
  const now = new Date();
  const todayNoonUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const nextWeek = new Date(todayNoonUtc.getTime() + 7 * 86400000);

  await seedInteraction({ status: 'scheduled', scheduledFor: todayNoonUtc, timezone: 'UTC' });
  await seedInteraction({ status: 'scheduled', scheduledFor: nextWeek, timezone: 'UTC' });

  const result = await loadQueue('scheduledToday');
  assert.equal(result.total, 1);
});

test('awaitingClient queue matches status exactly', async () => {
  await seedInteraction({ status: 'awaiting_client' });
  await seedInteraction({ status: 'submitted' });
  const result = await loadQueue('awaitingClient');
  assert.equal(result.total, 1);
});

test('noShowFollowUp queue matches status exactly', async () => {
  await seedInteraction({ status: 'no_show', scheduledFor: new Date(), timezone: 'UTC' });
  await seedInteraction({ status: 'submitted' });
  const result = await loadQueue('noShowFollowUp');
  assert.equal(result.total, 1);
});

test('recentlyAnswered queue matches status exactly and sorts by answeredAt descending', async () => {
  const admin = await AdminUser.create({ name: 'A2', email: `qc-${Date.now()}@example.com`, password: 'x', role: 'admin' });
  await seedInteraction({
    status: 'answered',
    answeredAt: new Date('2026-01-01'),
    answeredBy: admin._id,
    clientVisibleResponse: 'old',
  });
  await seedInteraction({
    status: 'answered',
    answeredAt: new Date('2026-06-01'),
    answeredBy: admin._id,
    clientVisibleResponse: 'new',
  });

  const result = await loadQueue('recentlyAnswered');
  assert.equal(result.total, 2);
  assert.equal(result.items[0].clientVisibleResponse, 'new');
});

test('overdueResponse queue is empty by default (no automatic SLA sets responseDueAt in this cycle)', async () => {
  await seedInteraction({ status: 'submitted' });
  const result = await loadQueue('overdueResponse');
  assert.equal(result.total, 0);
});

test('overdueResponse queue correctly includes an interaction once responseDueAt is set and passed', async () => {
  await seedInteraction({ status: 'submitted', responseDueAt: new Date(Date.now() - 1000) });
  await seedInteraction({ status: 'submitted', responseDueAt: new Date(Date.now() + 1000 * 60 * 60) });
  const result = await loadQueue('overdueResponse');
  assert.equal(result.total, 1);
});

test('queue pagination is bounded', async () => {
  for (let i = 0; i < 5; i += 1) {
    await seedInteraction({ status: 'submitted' });
  }
  const result = await loadQueue('unanswered', { limit: 2, page: 1 });
  assert.equal(result.items.length, 2);
  assert.equal(result.total, 5);
  assert.equal(result.totalPages, 3);
});

test('queueCounts returns a count for every defined queue', async () => {
  await seedInteraction({ status: 'submitted' });
  const counts = await queueCounts();
  assert.ok('unanswered' in counts);
  assert.ok('unassigned' in counts);
  assert.ok('awaitingScheduling' in counts);
  assert.ok('scheduledToday' in counts);
  assert.ok('overdueResponse' in counts);
  assert.ok('awaitingClient' in counts);
  assert.ok('noShowFollowUp' in counts);
  assert.ok('recentlyAnswered' in counts);
  assert.equal(counts.unanswered, 1);
});
