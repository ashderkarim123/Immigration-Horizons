/**
 * Server half of the manual-calendar-event contract (ADR-027). The root half is
 * test/calendar-schema-contract.test.ts; both load the same fixture.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/architecture/calendar-schema-contract.json'), 'utf8'));
const CaseCalendarEvent = require('../models/CaseCalendarEvent');
const C = require('../utils/calendarConstants');

test('collection name and field set match the contract', () => {
  assert.equal(CaseCalendarEvent.collection.collectionName, contract.collections.CaseCalendarEvent);
  const fields = Object.keys(CaseCalendarEvent.schema.paths).filter((p) => p !== '_id' && p !== '__v').sort();
  assert.deepEqual(fields, contract.fields.CaseCalendarEvent);
});

test('vocabularies and limits match the contract', () => {
  assert.deepEqual(C.EVENT_TYPES, contract.eventTypes);
  assert.deepEqual(C.EVENT_STATUSES, contract.eventStatuses);
  assert.deepEqual(C.LIMITS, contract.limits);
});

test('the Angular calendar types list the same event types (drift guard)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../enterprise-ui/projects/case-management/src/app/core/api/calendar.types.ts'), 'utf8');
  const start = src.indexOf('CALENDAR_EVENT_TYPES = [');
  const block = src.slice(start, src.indexOf('] as const', start));
  assert.deepEqual([...block.matchAll(/\{ value: '([a-z_]+)', label: /g)].map((m) => m[1]), C.EVENT_TYPES);
});
