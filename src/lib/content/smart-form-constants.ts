/**
 * Mirrors server/utils/smartFormConstants.js (ADR-021) — two independent
 * files, cross-checked against docs/architecture/smart-form-contract.json by
 * test/smart-form-schema-contract.test.ts and
 * server/test/smart-form-schema-contract.test.js.
 */

export const TEMPLATE_STATUSES = ["draft", "published", "retired"] as const;
export const TEMPLATE_AUDIENCES = ["client_and_staff"] as const;

// draft -> submitted -> (needs_changes -> submitted)* -> approved -> locked
export const FORM_STATUSES = ["draft", "submitted", "needs_changes", "approved", "locked"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const CLIENT_EDITABLE_STATUSES: readonly FormStatus[] = ["draft", "needs_changes"];
export const STAFF_EDITABLE_STATUSES: readonly FormStatus[] = ["draft", "needs_changes", "submitted"];

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "yes_no",
  "select",
  "multi_select",
  "country",
  "address",
  "repeated_group",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const CONDITION_OPERATORS = ["equals", "notEquals", "isTruthy", "isFalsy"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const ADDRESS_PARTS = ["line1", "line2", "city", "region", "postalCode", "country"] as const;

export const AUDIT_EVENT_TYPES = ["form_provisioned", "answers_saved", "submitted", "returned_for_changes", "approved", "locked"] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export const AUDIT_ACTOR_TYPES = ["client", "employee", "system"] as const;
export const SAVE_ACTOR_TYPES = ["client", "employee", "system"] as const;

export const MAX_TEXT_LENGTH = 500;
export const MAX_TEXTAREA_LENGTH = 5000;
export const MAX_REPEATED_ROWS = 25;
export const MAX_REVIEW_NOTE_LENGTH = 2000;
