const test = require('node:test');
const assert = require('node:assert/strict');

const vectors = require('../../docs/architecture/smart-form-engine-vectors.json');
const engine = require('../services/smartForms/engine');
const { assertCatalogValid, contentHash } = require('../services/smartForms/templateSeeder');
const { CATALOG } = require('../services/smartForms/catalog');
const { CASE_TYPE_VALUES } = require('../utils/caseConstants');

for (const v of vectors.normalizeValue) {
  test(`normalizeValue: ${v.name}`, () => {
    const result = engine.normalizeValue(v.field, v.raw, v.strict);
    if (v.error) assert.ok(result.error, 'expected an error');
    else assert.deepEqual(result.value === undefined ? null : result.value, v.value);
  });
}

for (const v of vectors.isVisible) {
  test(`isVisible: ${v.name}`, () => assert.equal(engine.isVisible(v.field, v.scope), v.visible));
}

for (const v of vectors.validateForSubmit) {
  test(`validateForSubmit/progress: ${v.name}`, () => {
    assert.deepEqual(Object.keys(engine.validateForSubmit(vectors.template, v.answers)).sort(), [...v.errorKeys].sort());
    assert.deepEqual(engine.computeProgress(vectors.template, v.answers), v.progress);
  });
}

test('writableKeys: clients never get staff-only keys', () => {
  assert.deepEqual(engine.writableKeys(vectors.template, 'client'), vectors.writableKeys.client);
  assert.deepEqual(engine.writableKeys(vectors.template, 'employee'), vectors.writableKeys.employee);
});

test('sectionsForAudience removes staff-only fields and empties sections for clients', () => {
  const template = { sections: [{ key: 's', title: 'S', fields: [{ key: 'a', staffOnly: true }] }, { key: 't', title: 'T', fields: [{ key: 'b' }, { key: 'c', staffOnly: true }] }] };
  const sections = engine.sectionsForAudience(template, 'client');
  assert.deepEqual(sections.map((s) => [s.key, s.fields.map((f) => f.key)]), [['t', ['b']]]);
  assert.equal(engine.sectionsForAudience(template, 'employee').length, 2);
});

test('normalizePatch: unknown and staff-only keys are errors for a client, never silently dropped', () => {
  const { values, errors } = engine.normalizePatch(vectors.template, { name: ' Ada ', staff_note: 'x', nope: 1 }, 'client');
  assert.deepEqual(values, { name: 'Ada' });
  assert.deepEqual(Object.keys(errors).sort(), ['nope', 'staff_note']);
});

test('normalizePatch: a group row error is addressable by path', () => {
  const { errors } = engine.normalizePatch(vectors.template, { trips: [{ when: 'not-a-date' }] }, 'client');
  assert.ok(errors.trips);
  assert.ok(errors['trips[0].when']);
});

test('template validation rejects the unsafe definitions the catalog must never contain', () => {
  const base = { key: 'ok', version: 1, title: 'T', sections: [{ key: 's', title: 'S', fields: [{ key: 'a', label: 'A', type: 'text' }] }] };
  assert.deepEqual(engine.validateTemplateDefinition(base), []);
  const problems = (fields) => engine.validateTemplateDefinition({ ...base, sections: [{ key: 's', title: 'S', fields }] }).join(' | ');

  assert.match(problems([{ key: 'A', label: 'A', type: 'text' }]), /snake_case/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'A', type: 'text' }]), /Duplicate field key/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'text', staffOnly: true, required: true }]), /staffOnly field cannot be required/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'select' }]), /options are required/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'text', visibilityCondition: { field: 'ghost', op: 'equals', value: 1 } }]), /another field/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'text', visibilityCondition: { field: 'a', op: 'eval' } }]), /op must be one of/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'repeated_group', children: [{ key: 'b', label: 'B', type: 'repeated_group', children: [{ key: 'c', label: 'C', type: 'text' }] }] }]), /not allowed inside a repeated group/);
  assert.match(problems([{ key: 'a', label: 'A', type: 'text', validation: { pattern: '.*' } }]), /unsupported validation/);
});

test('the shipped catalog is valid and covers every case type with an intake template', () => {
  assertCatalogValid();
  const intakeTypes = CATALOG.filter((t) => t.key.startsWith('intake_')).flatMap((t) => t.caseTypes);
  assert.deepEqual([...intakeTypes].sort(), [...CASE_TYPE_VALUES].sort());
});

test('contentHash is stable across key order and changes with content', () => {
  const a = CATALOG[0];
  assert.equal(contentHash(a), contentHash({ ...a, sections: JSON.parse(JSON.stringify(a.sections)) }));
  assert.notEqual(contentHash(a), contentHash({ ...a, title: `${a.title}!` }));
});
