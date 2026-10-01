/**
 * Filing Packet vocabulary (ADR-023). Staff-only: the client portal and the
 * Next.js app never read these collections, so there is no TS mirror.
 */

const PACKET_KINDS = ['initial_filing', 'rfe_response', 'noid_response', 'supplemental', 'other'];

// Kinds that must cite a finalized petition version before approval/finalization.
// `other` is the explicit exception (a packet of supporting material with no petition).
const PETITION_REQUIRED_KINDS = ['initial_filing', 'rfe_response', 'noid_response', 'supplemental'];

const PACKET_STATUSES = ['draft', 'review', 'needs_changes', 'approved', 'finalized', 'archived'];

// Statuses in which the manifest (source, items, order, metadata) may change.
const EDITABLE_STATUSES = ['draft', 'needs_changes'];

const ITEM_TYPES = ['document_version', 'smart_form_reference'];

const ITEM_ROLES = [
  'cover_sheet',
  'petition_letter',
  'uscis_form',
  'supporting_evidence',
  'recommendation_letter',
  'expert_opinion_letter',
  'business_plan',
  'identity_civil',
  'immigration_history',
  'exhibit',
  'other',
];

const VERSION_REASONS = ['finalization'];

const MAX_ITEMS = 200;
const MAX_NOTE_LENGTH = 2000;
const MAX_ITEM_NOTES_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

module.exports = {
  PACKET_KINDS,
  PETITION_REQUIRED_KINDS,
  PACKET_STATUSES,
  EDITABLE_STATUSES,
  ITEM_TYPES,
  ITEM_ROLES,
  VERSION_REASONS,
  MAX_ITEMS,
  MAX_NOTE_LENGTH,
  MAX_ITEM_NOTES_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
};
