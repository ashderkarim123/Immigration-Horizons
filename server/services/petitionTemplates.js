const { CASE_TYPE_VALUES } = require('../utils/caseConstants');

/**
 * Code-owned petition section templates by case type (ADR-022 §8, §30). Section
 * TITLES only — no legal text is shipped, so nothing here can state a standard
 * incorrectly or promise an outcome. Every current case type has an explicit
 * decision (asserted by test): either a structure that fits that work, or
 * `auto: false` meaning no petition is provisioned automatically (one can still
 * be created deliberately from the generic template).
 *
 * Section keys are durable: never rename or reuse one on a live petition.
 */

const s = (key, title, required = true) => ({ key, title, required });

const OVERVIEW = s('case_overview', 'Case overview');
const BACKGROUND = s('beneficiary_background', 'Beneficiary background');
const EVIDENCE = s('evidence_analysis', 'Evidence analysis');
const CONCLUSION = s('positioning_and_conclusion', 'Positioning and conclusion');

const TEMPLATES = {
  eb2_niw: [
    OVERVIEW,
    BACKGROUND,
    s('eligibility_framework', 'Eligibility framework'),
    s('proposed_endeavor', 'Proposed endeavor'),
    s('national_importance_and_merit', 'Substantial merit and national importance'),
    EVIDENCE,
    CONCLUSION,
  ],
  eb1a: [OVERVIEW, BACKGROUND, s('criteria_analysis', 'Criteria analysis'), EVIDENCE, s('sustained_acclaim', 'Sustained acclaim and final merits'), CONCLUSION],
  eb1b: [OVERVIEW, BACKGROUND, s('criteria_analysis', 'Criteria analysis'), EVIDENCE, s('employer_offer', 'Qualifying employment offer', false), CONCLUSION],
  eb1c: [
    OVERVIEW,
    BACKGROUND,
    s('qualifying_relationship', 'Qualifying corporate relationship'),
    s('managerial_executive_role', 'Managerial or executive role'),
    EVIDENCE,
    CONCLUSION,
  ],
  o1: [OVERVIEW, BACKGROUND, s('criteria_analysis', 'Criteria analysis'), EVIDENCE, s('itinerary_and_engagements', 'Itinerary and engagements', false), CONCLUSION],
  rfe_response: [
    s('notice_summary', 'Summary of the notice'),
    s('issue_responses', 'Response to each issue'),
    s('supporting_evidence', 'Supporting evidence', false),
    s('response_conclusion', 'Conclusion'),
  ],
  noid_response: [
    s('notice_summary', 'Summary of the notice'),
    s('grounds_responses', 'Response to each stated ground'),
    s('supporting_evidence', 'Supporting evidence', false),
    s('response_conclusion', 'Conclusion'),
  ],
  // Service-only matters: a work-product outline that fits, not a petition letter.
  recommendation_letters: [s('letter_plan', 'Recommender and letter plan'), s('drafting_notes', 'Drafting notes', false)],
  expert_opinion_letters: [s('scope_and_questions', 'Scope and questions'), s('opinion_outline', 'Opinion outline')],
  business_plan: [s('plan_outline', 'Plan outline'), s('assumptions_and_notes', 'Assumptions and notes', false)],
  evidence_packaging: [s('organization_plan', 'Evidence organization plan'), s('exhibit_notes', 'Exhibit notes', false)],
  uscis_forms: [s('preparation_notes', 'Forms preparation notes'), s('open_questions', 'Open questions', false)],
};

// "other" is too open-ended to guess a structure for: no automatic petition.
const NO_AUTOMATIC_PETITION = ['other'];

const GENERIC = [s('work_summary', 'Work summary'), s('notes', 'Notes', false)];

/** Decision for a case type: `{ auto, sections }`. */
function templateFor(caseType) {
  if (NO_AUTOMATIC_PETITION.includes(caseType)) return { auto: false, sections: GENERIC };
  return { auto: true, sections: TEMPLATES[caseType] || GENERIC };
}

/** Sections for a petition created deliberately: responses use the notice structure, the rest follow the case type. */
function sectionsFor(caseType, kind) {
  if (kind === 'rfe_response') return TEMPLATES.rfe_response;
  if (kind === 'noid_response') return TEMPLATES.noid_response;
  return templateFor(caseType).sections;
}

const withOrder = (sections) => sections.map((section, index) => ({ ...section, order: index + 1 }));

/** Throws if any case type lacks an explicit decision — run by the test suite. */
function assertCatalogComplete() {
  for (const caseType of CASE_TYPE_VALUES) {
    const known = caseType in TEMPLATES || NO_AUTOMATIC_PETITION.includes(caseType);
    if (!known) throw new Error(`Petition templates: no decision for case type "${caseType}".`);
  }
}

module.exports = { TEMPLATES, NO_AUTOMATIC_PETITION, templateFor, sectionsFor, withOrder, assertCatalogComplete };
