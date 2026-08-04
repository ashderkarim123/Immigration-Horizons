import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/interaction-schema-contract.json" with { type: "json" };

import { ConsultationInteraction } from "../src/lib/models/ConsultationInteraction";
import { InteractionHistory } from "../src/lib/models/InteractionHistory";
import { InteractionUpdate } from "../src/lib/models/InteractionUpdate";
import {
  SCOPE_TYPES,
  INTERACTION_TYPES,
  INTERACTION_STATUSES,
  INTERACTION_PRIORITIES,
  CLIENT_RESOLUTION_STATUSES,
  UPDATE_TYPES,
  UPDATE_VISIBILITY,
} from "../src/lib/content/interaction-constants";

test("collection names match the contract", () => {
  assert.equal(ConsultationInteraction.collection.collectionName, contract.collections.ConsultationInteraction);
  assert.equal(InteractionHistory.collection.collectionName, contract.collections.InteractionHistory);
  assert.equal(InteractionUpdate.collection.collectionName, contract.collections.InteractionUpdate);
});

test("scope/type/status/priority enums match the contract", () => {
  assert.deepEqual(SCOPE_TYPES, contract.scopeTypeValues);
  assert.deepEqual(INTERACTION_TYPES, contract.interactionTypeValues);
  assert.deepEqual(INTERACTION_STATUSES, contract.interactionStatusValues);
  assert.deepEqual(INTERACTION_PRIORITIES, contract.interactionPriorityValues);
  assert.deepEqual(CLIENT_RESOLUTION_STATUSES, contract.clientResolutionStatusValues);
});

test("update type/visibility enums match the contract", () => {
  assert.deepEqual(UPDATE_TYPES, contract.updateTypeValues);
  assert.deepEqual(UPDATE_VISIBILITY, contract.updateVisibilityValues);
});

test("required-field sets both apps rely on are present", () => {
  const requiredOnInteraction = ["interactionNumber", "scopeType", "clientUser", "subject", "description", "type"];
  for (const field of requiredOnInteraction) {
    assert.ok(ConsultationInteraction.schema.path(field), `ConsultationInteraction.${field} must exist`);
  }
  const requiredOnHistory = ["interaction", "eventType"];
  for (const field of requiredOnHistory) {
    assert.ok(InteractionHistory.schema.path(field), `InteractionHistory.${field} must exist`);
  }
  const requiredOnUpdate = ["interaction", "authorType", "updateType", "body", "visibility"];
  for (const field of requiredOnUpdate) {
    assert.ok(InteractionUpdate.schema.path(field), `InteractionUpdate.${field} must exist`);
  }
});
