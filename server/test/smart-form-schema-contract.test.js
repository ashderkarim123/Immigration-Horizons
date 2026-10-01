/**
 * Server half of the Smart Forms cross-app contract (ADR-021). The root half is
 * test/smart-form-schema-contract.test.ts; both load the same fixture.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/architecture/smart-form-contract.json'), 'utf8'));

const SmartFormTemplate = require('../models/SmartFormTemplate');
const CaseSmartForm = require('../models/CaseSmartForm');
const SmartFormAudit = require('../models/SmartFormAudit');
const C = require('../utils/smartFormConstants');

const fieldsOf = (Model) => Object.keys(Model.schema.paths).filter((p) => p !== '_id' && p !== '__v').sort();

test('collection names match the contract', () => {
  assert.equal(SmartFormTemplate.collection.collectionName, contract.collections.SmartFormTemplate);
  assert.equal(CaseSmartForm.collection.collectionName, contract.collections.CaseSmartForm);
  assert.equal(SmartFormAudit.collection.collectionName, contract.collections.SmartFormAudit);
});

test('field sets match the contract', () => {
  assert.deepEqual(fieldsOf(SmartFormTemplate), contract.fields.SmartFormTemplate);
  assert.deepEqual(fieldsOf(CaseSmartForm), contract.fields.CaseSmartForm);
  assert.deepEqual(fieldsOf(SmartFormAudit), contract.fields.SmartFormAudit);
});

test('vocabularies match the contract', () => {
  assert.deepEqual(C.TEMPLATE_STATUSES, contract.templateStatuses);
  assert.deepEqual(C.FORM_STATUSES, contract.formStatuses);
  assert.deepEqual(C.CLIENT_EDITABLE_STATUSES, contract.clientEditableStatuses);
  assert.deepEqual(C.STAFF_EDITABLE_STATUSES, contract.staffEditableStatuses);
  assert.deepEqual(C.FIELD_TYPES, contract.fieldTypes);
  assert.deepEqual(C.CONDITION_OPERATORS, contract.conditionOperators);
  assert.deepEqual(C.ADDRESS_PARTS, contract.addressParts);
  assert.deepEqual(C.AUDIT_EVENT_TYPES, contract.auditEventTypes);
  assert.deepEqual(C.AUDIT_ACTOR_TYPES, contract.auditActorTypes);
  assert.deepEqual(C.SAVE_ACTOR_TYPES, contract.saveActorTypes);
  assert.deepEqual(
    { maxTextLength: C.MAX_TEXT_LENGTH, maxTextareaLength: C.MAX_TEXTAREA_LENGTH, maxRepeatedRows: C.MAX_REPEATED_ROWS, maxReviewNoteLength: C.MAX_REVIEW_NOTE_LENGTH },
    contract.limits,
  );
});

test('model enums are driven by the shared vocabulary', () => {
  assert.deepEqual(CaseSmartForm.schema.path('status').enumValues, contract.formStatuses);
  assert.deepEqual(SmartFormTemplate.schema.path('status').enumValues, contract.templateStatuses);
  assert.deepEqual(SmartFormAudit.schema.path('eventType').enumValues, contract.auditEventTypes);
});
