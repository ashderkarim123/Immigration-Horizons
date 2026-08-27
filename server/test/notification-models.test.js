const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const Notification = require('../models/admin/Notification');
const NotificationPreference = require('../models/admin/NotificationPreference');
const AdminUser = require('../models/admin/User');
const ClientUser = require('../models/ClientUser');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function seedAdmin() {
  return AdminUser.create({ name: 'PM', email: `pm-${Date.now()}-${Math.random()}@example.com`, password: 'x', role: 'pm' });
}
async function seedClient() {
  const email = `client-${Date.now()}-${Math.random()}@example.com`;
  return ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', status: 'active' });
}

test('a notification created with legacy recipientName-only fields still saves (backward compatibility)', async () => {
  const n = await Notification.create({
    recipientName: 'Legacy Admin',
    title: 'Test',
    message: 'A message',
    type: 'new_lead',
  });
  assert.equal(n.recipientName, 'Legacy Admin');
  assert.equal(n.recipientType, null);
});

test('a notification created with recipientType employee populates recipientAdmin', async () => {
  const admin = await seedAdmin();
  const n = await Notification.create({
    recipientType: 'employee',
    recipientAdmin: admin._id,
    recipientName: admin.name,
    title: 'Test',
    message: 'A message',
    type: 'task_assigned',
  });
  assert.equal(String(n.recipientAdmin), String(admin._id));
});

test('a notification created with recipientType client populates recipientClient', async () => {
  const client = await seedClient();
  const n = await Notification.create({
    recipientType: 'client',
    recipientClient: client._id,
    title: 'Test',
    message: 'A message',
    type: 'query_answered',
  });
  assert.equal(String(n.recipientClient), String(client._id));
});

test('dedupeKey is unique — a second create with the same key is rejected at the database level', async () => {
  const client = await seedClient();
  await Notification.create({
    recipientType: 'client',
    recipientClient: client._id,
    title: 'Overdue',
    message: 'Overdue',
    type: 'document_request_overdue',
    dedupeKey: 'overdue:abc:2026-08-05',
  });
  await assert.rejects(
    Notification.create({
      recipientType: 'client',
      recipientClient: client._id,
      title: 'Overdue again',
      message: 'Overdue again',
      type: 'document_request_overdue',
      dedupeKey: 'overdue:abc:2026-08-05',
    }),
    (err) => err.code === 11000,
  );
});

test('two notifications with no dedupeKey set at all never collide (sparse index)', async () => {
  const client = await seedClient();
  await Notification.create({ recipientType: 'client', recipientClient: client._id, title: 'A', message: 'A', type: 'query_answered' });
  await Notification.create({ recipientType: 'client', recipientClient: client._id, title: 'B', message: 'B', type: 'query_answered' });
  const count = await Notification.countDocuments({ recipientClient: client._id });
  assert.equal(count, 2);
});

test('NotificationPreference requires recipientAdmin for an employee row', async () => {
  await assert.rejects(NotificationPreference.create({ recipientType: 'employee' }));
});

test('NotificationPreference requires recipientClient for a client row', async () => {
  await assert.rejects(NotificationPreference.create({ recipientType: 'client' }));
});

test('NotificationPreference defaults to mentionEmails/digestEmails true, digestFrequency daily', async () => {
  const client = await seedClient();
  const pref = await NotificationPreference.create({ recipientType: 'client', recipientClient: client._id });
  assert.equal(pref.mentionEmails, true);
  assert.equal(pref.digestEmails, true);
  assert.equal(pref.digestFrequency, 'daily');
});

test('NotificationPreference is unique per recipientClient', async () => {
  const client = await seedClient();
  await NotificationPreference.create({ recipientType: 'client', recipientClient: client._id });
  await assert.rejects(
    NotificationPreference.create({ recipientType: 'client', recipientClient: client._id }),
    (err) => err.code === 11000,
  );
});
