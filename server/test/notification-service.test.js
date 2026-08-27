const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const Notification = require('../models/admin/Notification');
const AdminUser = require('../models/admin/User');
const ClientUser = require('../models/ClientUser');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const {
  notifyEmployee,
  notifyClient,
  getOrCreatePreferences,
  updatePreferences,
  listForRecipient,
  getUnreadCount,
  markRead,
  markAllRead,
} = require('../services/notificationService');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function seedClientWithCase(membershipStatus = 'active') {
  const email = `client-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', status: 'active' });
  const pm = await AdminUser.create({ name: 'PM', email: `pm-${Date.now()}-${Math.random()}@example.com`, password: 'x', role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pm._id,
    createdBy: pm._id,
    createdByName: pm.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS' });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: membershipStatus,
  });
  return { client, caseDoc, workspace };
}

test('notifyEmployee creates a notification with both legacy and identity fields populated', async () => {
  const admin = await AdminUser.create({ name: 'PM', email: `pm-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const n = await notifyEmployee({ adminUserId: admin._id, adminUserName: admin.name, title: 'T', message: 'M', type: 'task_assigned' });
  assert.equal(n.recipientType, 'employee');
  assert.equal(String(n.recipientAdmin), String(admin._id));
  assert.equal(n.recipientName, admin.name);
});

test('notifyEmployee returns null and creates nothing when adminUserName is missing', async () => {
  const result = await notifyEmployee({ adminUserId: null, adminUserName: '', title: 'T', message: 'M', type: 'task_assigned' });
  assert.equal(result, null);
  assert.equal(await Notification.countDocuments({}), 0);
});

test('notifyClient creates a notification when no active-workspace guard is requested', async () => {
  const { client } = await seedClientWithCase();
  const n = await notifyClient({ clientUserId: client._id, title: 'T', message: 'M', type: 'query_answered' });
  assert.ok(n);
  assert.equal(String(n.recipientClient), String(client._id));
});

test('notifyClient creates nothing for a client whose workspace membership is not active (removed member receives no event)', async () => {
  const { client, workspace } = await seedClientWithCase('removed');
  const result = await notifyClient({
    clientUserId: client._id,
    requireActiveWorkspace: workspace._id,
    title: 'T',
    message: 'M',
    type: 'document_accepted',
  });
  assert.equal(result, null);
  assert.equal(await Notification.countDocuments({}), 0);
});

test('notifyClient creates a notification for an active member when the workspace guard is requested', async () => {
  const { client, workspace } = await seedClientWithCase('active');
  const result = await notifyClient({
    clientUserId: client._id,
    requireActiveWorkspace: workspace._id,
    title: 'T',
    message: 'M',
    type: 'document_accepted',
  });
  assert.ok(result);
});

test('createNotification is idempotent on a repeated dedupeKey — the second call returns the first document, not a duplicate', async () => {
  const { client } = await seedClientWithCase();
  const first = await notifyClient({ clientUserId: client._id, title: 'T', message: 'M', type: 'document_request_overdue', dedupeKey: 'k1' });
  const second = await notifyClient({ clientUserId: client._id, title: 'T2', message: 'M2', type: 'document_request_overdue', dedupeKey: 'k1' });
  assert.equal(String(first._id), String(second._id));
  assert.equal(await Notification.countDocuments({ dedupeKey: 'k1' }), 1);
});

test('getOrCreatePreferences is lazy and returns the same row on a second call', async () => {
  const { client } = await seedClientWithCase();
  const first = await getOrCreatePreferences({ recipientType: 'client', recipientClientId: client._id });
  const second = await getOrCreatePreferences({ recipientType: 'client', recipientClientId: client._id });
  assert.equal(String(first._id), String(second._id));
});

test('updatePreferences only writes the allowed fields', async () => {
  const { client } = await seedClientWithCase();
  const updated = await updatePreferences({
    recipientType: 'client',
    recipientClientId: client._id,
    updates: { mentionEmails: false, digestFrequency: 'weekly', recipientType: 'employee' },
  });
  assert.equal(updated.mentionEmails, false);
  assert.equal(updated.digestFrequency, 'weekly');
  assert.equal(updated.recipientType, 'client'); // not an allowed field — unchanged
});

test('listForRecipient/getUnreadCount/markRead/markAllRead scope strictly to the caller', async () => {
  const { client: clientA } = await seedClientWithCase();
  const { client: clientB } = await seedClientWithCase();

  const nA = await notifyClient({ clientUserId: clientA._id, title: 'A', message: 'A', type: 'query_answered' });
  await notifyClient({ clientUserId: clientB._id, title: 'B', message: 'B', type: 'query_answered' });

  const listA = await listForRecipient({ recipientType: 'client', recipientClientId: clientA._id });
  assert.equal(listA.length, 1);
  assert.equal(await getUnreadCount({ recipientType: 'client', recipientClientId: clientA._id }), 1);

  // clientB cannot mark clientA's notification read.
  const wrongOwner = await markRead({ notificationId: nA._id, recipientType: 'client', recipientClientId: clientB._id });
  assert.equal(wrongOwner, null);
  assert.equal(await getUnreadCount({ recipientType: 'client', recipientClientId: clientA._id }), 1);

  const rightOwner = await markRead({ notificationId: nA._id, recipientType: 'client', recipientClientId: clientA._id });
  assert.ok(rightOwner.read);
  assert.equal(await getUnreadCount({ recipientType: 'client', recipientClientId: clientA._id }), 0);
  // clientB's own notification is untouched.
  assert.equal(await getUnreadCount({ recipientType: 'client', recipientClientId: clientB._id }), 1);

  await markAllRead({ recipientType: 'client', recipientClientId: clientB._id });
  assert.equal(await getUnreadCount({ recipientType: 'client', recipientClientId: clientB._id }), 0);
});
