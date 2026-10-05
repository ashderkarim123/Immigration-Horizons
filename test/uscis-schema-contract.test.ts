import { test } from "node:test";
import assert from "node:assert/strict";

import contract from "../docs/architecture/uscis-schema-contract.json" with { type: "json" };

import { USCISFiling } from "../src/lib/models/USCISFiling";
import { USCISStatusEvent } from "../src/lib/models/USCISStatusEvent";
import * as C from "../src/lib/content/uscis-constants";

/**
 * Root half of the USCIS tracking cross-app contract (ADR-026) — the other half is
 * server/test/uscis-schema-contract.test.js.
 */

const fieldsOf = (Model: { schema: { paths: Record<string, unknown> } }) =>
  Object.keys(Model.schema.paths)
    .filter((p) => p !== "_id" && p !== "__v")
    .sort();

test("collection names match the contract", () => {
  assert.equal(USCISFiling.collection.collectionName, contract.collections.USCISFiling);
  assert.equal(USCISStatusEvent.collection.collectionName, contract.collections.USCISStatusEvent);
});

test("field sets match the contract", () => {
  assert.deepEqual(fieldsOf(USCISFiling), contract.fields.USCISFiling);
  assert.deepEqual(fieldsOf(USCISStatusEvent), contract.fields.USCISStatusEvent);
});

test("vocabularies and limits match the contract", () => {
  assert.deepEqual([...C.USCIS_STATUS_CATEGORIES], contract.statusCategories);
  assert.deepEqual([...C.USCIS_STATUS_SOURCES], contract.statusSources);
  assert.deepEqual([...C.USCIS_TRACKING_PROVIDERS], contract.trackingProviders);
  assert.deepEqual({ ...C.USCIS_LIMITS }, contract.limits);
});
