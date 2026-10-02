const { CASE_TYPES, CASE_TYPE_VALUES } = require('../../utils/caseConstants');

/**
 * Code-owned Smart Forms catalog (ADR-021 §19). Deliberately concise intake
 * templates — not a reproduction of official USCIS forms. Field keys are part
 * of the durable data contract: never rename or repurpose a key in a published
 * version; ship a new `version` instead (the seeder refuses to overwrite).
 *
 * Case types come from CASE_TYPE_VALUES — there is no second case-type list.
 */

const opt = (...values) => values.map(([value, label]) => ({ value, label }));
const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const area = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });
const yesNo = (key, label, extra = {}) => ({ key, label, type: 'yes_no', ...extra });
const when = (field, op, value) => ({ field, op, ...(value === undefined ? {} : { value }) });

const PERSONAL_CONTACT = {
  key: 'personal_contact',
  version: 1,
  title: 'Personal & Contact Information',
  description: 'Your name, how to reach you, where you live and where you were born.',
  caseTypes: CASE_TYPE_VALUES,
  sections: [
    {
      key: 'identity',
      title: 'Personal information',
      fields: [
        text('given_name', 'Given (first) name', { required: true }),
        text('family_name', 'Family (last) name', { required: true }),
        text('other_names_used', 'Other names you have used', { helpText: 'Maiden name, previous spellings, or aliases. Leave blank if none.' }),
        { key: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
        { key: 'country_of_birth', label: 'Country of birth', type: 'country', required: true },
        { key: 'country_of_citizenship', label: 'Country of citizenship', type: 'country', required: true },
      ],
    },
    {
      key: 'contact',
      title: 'Contact details',
      fields: [
        { key: 'email', label: 'Email address', type: 'email', required: true },
        { key: 'phone', label: 'Phone / WhatsApp', type: 'phone' },
        {
          key: 'preferred_contact_method',
          label: 'Preferred way to be contacted',
          type: 'select',
          options: opt(['email', 'Email'], ['phone', 'Phone call'], ['whatsapp', 'WhatsApp']),
        },
      ],
    },
    {
      key: 'address',
      title: 'Current address',
      fields: [
        { key: 'current_address', label: 'Where you live now', type: 'address', required: true },
        yesNo('mailing_address_differs', 'Is your mailing address different?'),
        {
          key: 'mailing_address',
          label: 'Mailing address',
          type: 'address',
          required: true,
          visibilityCondition: when('mailing_address_differs', 'equals', true),
        },
      ],
    },
    {
      key: 'staff_review',
      title: 'Staff notes',
      fields: [area('staff_identity_notes', 'Internal identity-check notes', { staffOnly: true })],
    },
  ],
};

const IMMIGRATION_TRAVEL_HISTORY = {
  key: 'immigration_travel_history',
  version: 1,
  title: 'Immigration & Travel History',
  description: 'Your current status, prior U.S. filings and recent travel to the United States.',
  caseTypes: CASE_TYPE_VALUES,
  sections: [
    {
      key: 'status',
      title: 'Current status',
      fields: [
        yesNo('currently_in_us', 'Are you currently in the United States?', { required: true }),
        {
          key: 'current_us_status',
          label: 'Your current U.S. immigration status',
          type: 'select',
          required: true,
          options: opt(['f1', 'F-1 student'], ['h1b', 'H-1B'], ['o1', 'O-1'], ['l1', 'L-1'], ['j1', 'J-1'], ['b1b2', 'B-1/B-2 visitor'], ['pending', 'Application pending'], ['other', 'Other']),
          visibilityCondition: when('currently_in_us', 'equals', true),
        },
        { key: 'status_expiry', label: 'Authorized stay expires on', type: 'date', visibilityCondition: when('currently_in_us', 'equals', true) },
        { key: 'i94_number', label: 'I-94 number', type: 'text', visibilityCondition: when('currently_in_us', 'equals', true), validation: { maxLength: 20 } },
      ],
    },
    {
      key: 'prior_filings',
      title: 'Prior filings',
      fields: [
        yesNo('has_prior_filings', 'Have you or an employer ever filed an immigration petition for you?', { required: true }),
        area('prior_filings_detail', 'Tell us about each prior filing', {
          required: true,
          visibilityCondition: when('has_prior_filings', 'equals', true),
        }),
        yesNo('has_prior_denial', 'Have you ever been refused a visa or denied an immigration benefit?', { required: true }),
        area('prior_denial_detail', 'What happened?', { required: true, visibilityCondition: when('has_prior_denial', 'equals', true) }),
      ],
    },
    {
      key: 'travel',
      title: 'Travel history',
      fields: [
        {
          key: 'us_trips',
          label: 'Trips to the United States (last 5 years)',
          type: 'repeated_group',
          helpText: 'Add one entry per trip.',
          validation: { maxItems: 25 },
          children: [
            { key: 'entry_date', label: 'Entered on', type: 'date', required: true },
            { key: 'exit_date', label: 'Left on', type: 'date' },
            text('purpose', 'Purpose of the trip', { required: true }),
          ],
        },
      ],
    },
  ],
};

const CASE_FACTS = {
  eb2_niw: [
    text('field_of_work', 'Your field of work', { required: true }),
    area('proposed_endeavor', 'Your proposed endeavor in the United States', { required: true }),
    area('national_importance', 'Why this work matters beyond your own employer', { helpText: 'A few sentences on its wider benefit to the country.' }),
  ],
  eb1a: [
    text('field_of_work', 'Your field of work', { required: true }),
    area('major_achievements', 'Your most significant achievements', { required: true }),
    {
      key: 'awards',
      label: 'Awards and recognitions',
      type: 'repeated_group',
      children: [text('award_name', 'Award or recognition', { required: true }), text('awarded_by', 'Awarded by'), { key: 'year', label: 'Year', type: 'number', validation: { integer: true, min: 1950, max: 2100 } }],
    },
  ],
  eb1b: [
    text('institution', 'Your current institution', { required: true }),
    text('research_area', 'Research or teaching area', { required: true }),
    { key: 'publication_count', label: 'Approximate number of publications', type: 'number', validation: { integer: true, min: 0, max: 5000 } },
  ],
  eb1c: [
    text('foreign_employer', 'Employer outside the United States', { required: true }),
    text('us_entity', 'Related U.S. entity', { required: true }),
    text('role_abroad', 'Your role abroad', { required: true }),
    { key: 'years_with_employer', label: 'Years with the foreign employer', type: 'number', validation: { min: 0, max: 80 } },
  ],
  o1: [
    {
      key: 'o1_field',
      label: 'Field of extraordinary ability',
      type: 'select',
      required: true,
      options: opt(['sciences', 'Sciences'], ['arts', 'Arts'], ['business', 'Business'], ['athletics', 'Athletics'], ['education', 'Education'], ['film_tv', 'Film & television']),
    },
    text('us_employer_or_agent', 'Intended U.S. employer or agent'),
    area('major_achievements', 'Your most significant achievements', { required: true }),
  ],
  rfe_response: [
    text('receipt_number', 'USCIS receipt number', { required: true, validation: { maxLength: 20 } }),
    { key: 'notice_date', label: 'Date on the notice', type: 'date', required: true },
    { key: 'response_deadline', label: 'Response due by', type: 'date', required: true },
    area('issues_raised', 'Issues the notice raises, in your words'),
  ],
  noid_response: [
    text('receipt_number', 'USCIS receipt number', { required: true, validation: { maxLength: 20 } }),
    { key: 'notice_date', label: 'Date on the notice', type: 'date', required: true },
    { key: 'response_deadline', label: 'Response due by', type: 'date', required: true },
    area('issues_raised', 'Grounds for the intended denial, in your words'),
  ],
  recommendation_letters: [
    {
      key: 'recommenders',
      label: 'People who could recommend you',
      type: 'repeated_group',
      required: true,
      children: [
        text('recommender_name', 'Full name', { required: true }),
        text('recommender_title', 'Title and organization', { required: true }),
        { key: 'relationship', label: 'How you know them', type: 'select', options: opt(['colleague', 'Colleague'], ['supervisor', 'Supervisor'], ['collaborator', 'Collaborator'], ['client', 'Client'], ['independent', 'Independent expert']) },
      ],
    },
  ],
  expert_opinion_letters: [text('field_of_expertise', 'Field the opinion should cover', { required: true }), area('opinion_topics', 'What the opinion should address', { required: true })],
  business_plan: [
    text('business_name', 'Business or venture name', { required: true }),
    { key: 'business_stage', label: 'Stage', type: 'select', options: opt(['idea', 'Idea'], ['launched', 'Launched'], ['revenue', 'Earning revenue']) },
    area('business_summary', 'What the business does', { required: true }),
  ],
  evidence_packaging: [area('evidence_summary', 'What evidence you already have and how it is organized', { required: true })],
  uscis_forms: [
    {
      key: 'forms_needed',
      label: 'Forms you expect to need',
      type: 'multi_select',
      required: true,
      options: opt(['i140', 'I-140'], ['i485', 'I-485'], ['i765', 'I-765'], ['i131', 'I-131'], ['i129', 'I-129'], ['other', 'Other / not sure']),
    },
    area('filing_context', 'Context for the filing'),
  ],
  other: [area('request_summary', 'What do you need help with?', { required: true })],
};

function caseSpecificTemplate({ value, label }) {
  const fields = CASE_FACTS[value];
  if (!fields) throw new Error(`Smart Forms catalog has no case-specific fields for case type "${value}".`);
  return {
    key: `intake_${value}`,
    version: 1,
    title: `${label} — Case Intake`,
    description: `Facts specific to your ${label} matter.`,
    caseTypes: [value],
    sections: [
      { key: 'case_facts', title: 'Case-specific facts', fields },
      { key: 'staff_review', title: 'Staff notes', fields: [area('staff_case_notes', 'Internal case notes', { staffOnly: true })] },
    ],
  };
}

const CATALOG = [PERSONAL_CONTACT, IMMIGRATION_TRAVEL_HISTORY, ...CASE_TYPES.map(caseSpecificTemplate)];

module.exports = { CATALOG };
