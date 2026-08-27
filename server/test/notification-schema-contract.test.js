const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/architecture/notification-schema-contract.json'), 'utf8'),
);
const Notification = require('../models/admin/Notification');
const NotificationPreference = require('../models/admin/NotificationPreference');

test('collection names match the contract', () => {
  assert.equal(Notification.collection.collectionName, contract.collections.Notification);
  assert.equal(NotificationPreference.collection.collectionName, contract.collections.NotificationPreference);
});

test('recipientType/emailState/digestFrequency enums match the contract', () => {
  assert.deepEqual([...Notification.RECIPIENT_TYPES], contract.recipientTypeValues);
  assert.deepEqual([...Notification.EMAIL_STATES], contract.emailStateValues);
  assert.deepEqual([...NotificationPreference.DIGEST_FREQUENCIES], contract.digestFrequencyValues);
});

test('notification type enum matches the contract exactly', () => {
  assert.deepEqual([...Notification.TYPES], contract.notificationTypeValues);
});

test('every client-eligible type in the contract is a real notification type', () => {
  for (const type of contract.clientEligibleTypeValues) {
    assert.ok(contract.notificationTypeValues.includes(type), `${type} must be a declared notification type`);
  }
});

test('required identity fields exist on both models', () => {
  for (const field of ['recipientType', 'recipientAdmin', 'recipientClient', 'dedupeKey', 'emailState']) {
    assert.ok(Notification.schema.path(field), `Notification.${field} must exist`);
  }
  for (const field of ['recipientType', 'recipientAdmin', 'recipientClient', 'mentionEmails', 'digestEmails', 'digestFrequency']) {
    assert.ok(NotificationPreference.schema.path(field), `NotificationPreference.${field} must exist`);
  }
});
