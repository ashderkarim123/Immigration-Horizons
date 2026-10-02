/**
 * Petition Work vocabulary (ADR-022). Staff-only: the client portal and the
 * Next.js app never read these collections, so there is no TS mirror.
 */

const PETITION_KINDS = ['primary', 'rfe_response', 'noid_response', 'supplemental', 'other'];

const PETITION_STATUSES = ['drafting', 'internal_review', 'needs_changes', 'approved', 'finalized', 'archived'];

// Statuses in which section text may change (a finalized/approved petition is not a draft).
const DRAFTING_STATUSES = ['drafting', 'needs_changes'];
// Statuses in which section review (ready / return / approve) and dependency links may change.
const REVIEWABLE_STATUSES = ['drafting', 'needs_changes', 'internal_review'];

const SECTION_REVIEW_STATUSES = ['draft', 'ready_for_review', 'changes_requested', 'approved'];

const DEPENDENCY_TYPES = ['evidence_requirement', 'smart_form', 'case_document', 'task'];
const DOCUMENT_DEPENDENCY_ROLES = ['business_plan', 'recommendation_letter', 'expert_opinion_letter', 'supporting_document', 'other'];

const VERSION_REASONS = ['approval', 'finalization'];

// Plain text with line breaks only — never HTML.
const MAX_SECTION_BODY_LENGTH = 50000;
const MAX_NOTE_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_DEPENDENCIES = 100;

module.exports = {
  PETITION_KINDS,
  PETITION_STATUSES,
  DRAFTING_STATUSES,
  REVIEWABLE_STATUSES,
  SECTION_REVIEW_STATUSES,
  DEPENDENCY_TYPES,
  DOCUMENT_DEPENDENCY_ROLES,
  VERSION_REASONS,
  MAX_SECTION_BODY_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DEPENDENCIES,
};
