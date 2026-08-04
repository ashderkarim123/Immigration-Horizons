const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/architecture/interaction-schema-contract.json'), 'utf8'),
);

const ConsultationInteraction = require('../models/ConsultationInteraction');
const InteractionHistory = require('../models/InteractionHistory');
const InteractionUpdate = require('../models/InteractionUpdate');
const {
  SCOPE_TYPES,
  INTERACTION_TYPES,
  INTERACTION_STATUSES,
  INTERACTION_PRIORITIES,
  CLIENT_RESOLUTION_STATUSES,
  HISTORY_EVENT_TYPES,
  UPDATE_TYPES,
  UPDATE_VISIBILITY,
} = require('../utils/interactionConstants');

test('collection names match the contract', () => {
  assert.equal(ConsultationInteraction.collection.collectionName, contract.collections.ConsultationInteraction);
  assert.equal(InteractionHistory.collection.collectionName, contract.collections.InteractionHistory);
  assert.equal(InteractionUpdate.collection.collectionName, contract.collections.InteractionUpdate);
});

test('scope/type/status/priority enums match the contract', () => {
  assert.deepEqual(SCOPE_TYPES, contract.scopeTypeValues);
  assert.deepEqual(INTERACTION_TYPES, contract.interactionTypeValues);
  assert.deepEqual(INTERACTION_STATUSES, contract.interactionStatusValues);
  assert.deepEqual(INTERACTION_PRIORITIES, contract.interactionPriorityValues);
  assert.deepEqual(CLIENT_RESOLUTION_STATUSES, contract.clientResolutionStatusValues);

  assert.deepEqual(ConsultationInteraction.schema.path('scopeType').enumValues, contract.scopeTypeValues);
  assert.deepEqual(ConsultationInteraction.schema.path('type').enumValues, contract.interactionTypeValues);
  assert.deepEqual(ConsultationInteraction.schema.path('status').enumValues, contract.interactionStatusValues);
  assert.deepEqual(ConsultationInteraction.schema.path('priority').enumValues, contract.interactionPriorityValues);
});

test('history event types match the contract', () => {
  assert.deepEqual(HISTORY_EVENT_TYPES, contract.historyEventTypeValues);
  assert.deepEqual(InteractionHistory.schema.path('eventType').enumValues, contract.historyEventTypeValues);
});

test('update type/visibility enums match the contract', () => {
  assert.deepEqual(UPDATE_TYPES, contract.updateTypeValues);
  assert.deepEqual(UPDATE_VISIBILITY, contract.updateVisibilityValues);
  assert.deepEqual(InteractionUpdate.schema.path('updateType').enumValues, contract.updateTypeValues);
  assert.deepEqual(InteractionUpdate.schema.path('visibility').enumValues, contract.updateVisibilityValues);
});

test('required-field sets both apps rely on are present', () => {
  const requiredOnInteraction = ['interactionNumber', 'scopeType', 'clientUser', 'subject', 'description', 'type'];
  for (const field of requiredOnInteraction) {
    assert.ok(ConsultationInteraction.schema.path(field), `ConsultationInteraction.${field} must exist`);
  }
  const requiredOnHistory = ['interaction', 'eventType'];
  for (const field of requiredOnHistory) {
    assert.ok(InteractionHistory.schema.path(field), `InteractionHistory.${field} must exist`);
  }
  const requiredOnUpdate = ['interaction', 'authorType', 'updateType', 'body', 'visibility'];
  for (const field of requiredOnUpdate) {
    assert.ok(InteractionUpdate.schema.path(field), `InteractionUpdate.${field} must exist`);
  }
});
