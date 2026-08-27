import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/notification-schema-contract.json" with { type: "json" };

import { Notification, NOTIFICATION_TYPES, RECIPIENT_TYPES, EMAIL_STATES } from "../src/lib/models/Notification";
import { NotificationPreference, DIGEST_FREQUENCIES } from "../src/lib/models/NotificationPreference";

test("collection names match the contract", () => {
  assert.equal(Notification.collection.collectionName, contract.collections.Notification);
  assert.equal(NotificationPreference.collection.collectionName, contract.collections.NotificationPreference);
});

test("recipientType/emailState/digestFrequency enums match the contract", () => {
  assert.deepEqual([...RECIPIENT_TYPES], contract.recipientTypeValues);
  assert.deepEqual([...EMAIL_STATES], contract.emailStateValues);
  assert.deepEqual([...DIGEST_FREQUENCIES], contract.digestFrequencyValues);
});

test("notification type enum matches the contract exactly", () => {
  assert.deepEqual([...NOTIFICATION_TYPES], contract.notificationTypeValues);
});

test("required identity fields exist on both models", () => {
  for (const field of ["recipientType", "recipientAdmin", "recipientClient", "dedupeKey", "emailState"]) {
    assert.ok(Notification.schema.path(field), `Notification.${field} must exist`);
  }
  for (const field of ["recipientType", "recipientAdmin", "recipientClient", "mentionEmails", "digestEmails", "digestFrequency"]) {
    assert.ok(NotificationPreference.schema.path(field), `NotificationPreference.${field} must exist`);
  }
});
