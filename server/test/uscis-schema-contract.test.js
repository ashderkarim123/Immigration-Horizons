/**
 * Server half of the USCIS tracking cross-app contract (ADR-026). The root half is
 * test/uscis-schema-contract.test.ts; both load the same fixture.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/architecture/uscis-schema-contract.json'), 'utf8'));
const USCISFiling = require('../models/USCISFiling');
const USCISStatusEvent = require('../models/USCISStatusEvent');
const C = require('../utils/uscisConstants');

const fieldsOf = (Model) => Object.keys(Model.schema.paths).filter((p) => p !== '_id' && p !== '__v').sort();

test('collection names match the contract', () => {
  assert.equal(USCISFiling.collection.collectionName, contract.collections.USCISFiling);
  assert.equal(USCISStatusEvent.collection.collectionName, contract.collections.USCISStatusEvent);
});

test('field sets match the contract', () => {
  assert.deepEqual(fieldsOf(USCISFiling), contract.fields.USCISFiling);
  assert.deepEqual(fieldsOf(USCISStatusEvent), contract.fields.USCISStatusEvent);
});

test('vocabularies and limits match the contract', () => {
  assert.deepEqual(C.STATUS_CATEGORIES, contract.statusCategories);
  assert.deepEqual(C.STATUS_SOURCES, contract.statusSources);
  assert.deepEqual(C.TRACKING_PROVIDERS, contract.trackingProviders);
  assert.deepEqual(C.LIMITS, contract.limits);
});

test('the Angular status-category list matches the contract (drift guard)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../enterprise-ui/projects/case-management/src/app/core/api/uscis.types.ts'), 'utf8');
  const listed = [...src.matchAll(/\{ value: '([a-z_]+)', label: '/g)].map((m) => m[1]);
  assert.deepEqual(listed, contract.statusCategories);
});
