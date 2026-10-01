const test = require('node:test');
const assert = require('node:assert/strict');

const { CASE_TYPE_VALUES } = require('../utils/caseConstants');
const { TEMPLATES, NO_AUTOMATIC_PETITION, templateFor, sectionsFor, withOrder, assertCatalogComplete } = require('../services/petitionTemplates');

test('every current case type has an explicit petition-template decision', () => {
  assertCatalogComplete();
  for (const caseType of CASE_TYPE_VALUES) {
    const decision = templateFor(caseType);
    assert.ok(decision.sections.length > 0, `${caseType} has sections`);
    assert.equal(decision.auto, !NO_AUTOMATIC_PETITION.includes(caseType));
  }
  assert.equal(templateFor('other').auto, false);
  assert.equal(templateFor('eb2_niw').auto, true);
});

test('section keys are unique, snake_case and ordered; every template has a required section', () => {
  for (const [caseType, sections] of Object.entries(TEMPLATES)) {
    const keys = sections.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${caseType} keys are unique`);
    for (const key of keys) assert.match(key, /^[a-z][a-z0-9_]*$/);
    assert.ok(sections.some((s) => s.required), `${caseType} needs at least one required section`);
    assert.deepEqual(withOrder(sections).map((s) => s.order), sections.map((_, i) => i + 1));
  }
});

test('service-only case types get a work-product outline, not a petition-letter outline', () => {
  for (const caseType of ['recommendation_letters', 'expert_opinion_letters', 'business_plan', 'evidence_packaging', 'uscis_forms']) {
    const keys = TEMPLATES[caseType].map((s) => s.key);
    assert.ok(!keys.includes('case_overview') && !keys.includes('eligibility_framework'), `${caseType} must not carry a petition-letter outline`);
  }
});

test('response petitions use the notice structure whatever the case type', () => {
  assert.equal(sectionsFor('eb2_niw', 'rfe_response')[0].key, 'notice_summary');
  assert.equal(sectionsFor('eb2_niw', 'noid_response')[1].key, 'grounds_responses');
  assert.equal(sectionsFor('eb2_niw', 'primary')[0].key, 'case_overview');
});

test('no template makes a legal claim or promise: titles only', () => {
  const titles = Object.values(TEMPLATES).flat().map((s) => s.title).join(' ').toLowerCase();
  for (const banned of ['guarantee', 'attorney', 'lawyer', 'legal advice', 'approval rate']) assert.ok(!titles.includes(banned), banned);
});
