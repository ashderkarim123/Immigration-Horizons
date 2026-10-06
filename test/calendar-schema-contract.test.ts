import { test } from "node:test";
import assert from "node:assert/strict";

import contract from "../docs/architecture/calendar-schema-contract.json" with { type: "json" };

import { CaseCalendarEvent } from "../src/lib/models/CaseCalendarEvent";
import * as C from "../src/lib/content/calendar-constants";

/**
 * Root half of the manual-calendar-event contract (ADR-027) — the other half is
 * server/test/calendar-schema-contract.test.js.
 */

test("collection name and field set match the contract", () => {
  assert.equal(CaseCalendarEvent.collection.collectionName, contract.collections.CaseCalendarEvent);
  const fields = Object.keys(CaseCalendarEvent.schema.paths)
    .filter((p) => p !== "_id" && p !== "__v")
    .sort();
  assert.deepEqual(fields, contract.fields.CaseCalendarEvent);
});

test("vocabularies and limits match the contract", () => {
  assert.deepEqual([...C.CALENDAR_EVENT_TYPES], contract.eventTypes);
  assert.deepEqual([...C.CALENDAR_EVENT_STATUSES], contract.eventStatuses);
  assert.deepEqual({ ...C.CALENDAR_LIMITS }, contract.limits);
});
