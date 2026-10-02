/**
 * Smart Forms vocabulary (ADR-021). Mirrored — not shared at runtime — by
 * src/lib/content/smart-form-constants.ts; server/test/smart-form-schema-contract.test.js
 * and test/smart-form-schema-contract.test.ts assert both against
 * docs/architecture/smart-form-contract.json.
 */

const TEMPLATE_STATUSES = ['draft', 'published', 'retired'];
const TEMPLATE_AUDIENCES = ['client_and_staff'];

// draft -> submitted -> (needs_changes -> submitted)* -> approved -> locked
const FORM_STATUSES = ['draft', 'submitted', 'needs_changes', 'approved', 'locked'];

// Who may change answers in which state. A locked form is immutable for everyone.
const CLIENT_EDITABLE_STATUSES = ['draft', 'needs_changes'];
const STAFF_EDITABLE_STATUSES = ['draft', 'needs_changes', 'submitted'];

const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'date',
  'yes_no',
  'select',
  'multi_select',
  'country',
  'address',
  'repeated_group',
];

// The whole condition vocabulary. There is deliberately no expression language.
const CONDITION_OPERATORS = ['equals', 'notEquals', 'isTruthy', 'isFalsy'];

const ADDRESS_PARTS = ['line1', 'line2', 'city', 'region', 'postalCode', 'country'];

const AUDIT_EVENT_TYPES = ['form_provisioned', 'answers_saved', 'submitted', 'returned_for_changes', 'approved', 'locked'];
const AUDIT_ACTOR_TYPES = ['client', 'employee', 'system'];

const SAVE_ACTOR_TYPES = ['client', 'employee', 'system'];

const MAX_TEXT_LENGTH = 500;
const MAX_TEXTAREA_LENGTH = 5000;
const MAX_REPEATED_ROWS = 25;
const MAX_REVIEW_NOTE_LENGTH = 2000;

module.exports = {
  TEMPLATE_STATUSES,
  TEMPLATE_AUDIENCES,
  FORM_STATUSES,
  CLIENT_EDITABLE_STATUSES,
  STAFF_EDITABLE_STATUSES,
  FIELD_TYPES,
  CONDITION_OPERATORS,
  ADDRESS_PARTS,
  AUDIT_EVENT_TYPES,
  AUDIT_ACTOR_TYPES,
  SAVE_ACTOR_TYPES,
  MAX_TEXT_LENGTH,
  MAX_TEXTAREA_LENGTH,
  MAX_REPEATED_ROWS,
  MAX_REVIEW_NOTE_LENGTH,
};
