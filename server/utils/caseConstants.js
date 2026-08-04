/**
 * Centralized case/workspace/membership vocabulary — the single source of
 * truth this app's models/routes/views import from, so case-type and
 * status strings never get spread ad hoc across controllers and templates.
 *
 * Mirrored (not shared at runtime) by src/lib/content/case-constants.ts in
 * the Next.js app — see docs/architecture/ADR-002-case-workspace-domain.md
 * §4 for why, and server/test/case-schema-contract.test.js for the test
 * that keeps the two in sync.
 */

// ---------------------------------------------------------------------------
// Case types
// ---------------------------------------------------------------------------

const CASE_TYPES = [
  { value: 'eb2_niw', label: 'EB-2 NIW' },
  { value: 'eb1a', label: 'EB-1A' },
  { value: 'eb1b', label: 'EB-1B' },
  { value: 'eb1c', label: 'EB-1C' },
  { value: 'o1', label: 'O-1' },
  { value: 'rfe_response', label: 'RFE Response' },
  { value: 'noid_response', label: 'NOID Response' },
  { value: 'recommendation_letters', label: 'Recommendation Letters' },
  { value: 'expert_opinion_letters', label: 'Expert Opinion Letters' },
  { value: 'business_plan', label: 'Business Plan' },
  { value: 'evidence_packaging', label: 'Evidence Packaging' },
  { value: 'uscis_forms', label: 'USCIS Forms Support' },
  { value: 'other', label: 'Other' },
];
const CASE_TYPE_VALUES = CASE_TYPES.map((t) => t.value);

/**
 * Deliberate mapping from Consultation.service (a free-form-ish display
 * string typed by whoever built the form, e.g. "RFE & NOID Responses") to a
 * CASE_TYPES value — never assumed to match by coincidence. Anything not
 * explicitly listed here (including "Immigration Consultation" and "Not
 * Sure / Need Guidance", which have no case-type equivalent) maps to
 * 'other' rather than throwing, since the manager can always correct the
 * case type in the conversion form before submitting.
 */
const SERVICE_TO_CASE_TYPE = {
  'EB-2 NIW': 'eb2_niw',
  'EB-1A': 'eb1a',
  'EB-1B': 'eb1b',
  'EB-1C': 'eb1c',
  'O-1 Visa': 'o1',
  'RFE & NOID Responses': 'rfe_response',
  'Recommendation Letters': 'recommendation_letters',
  'Expert Opinion Letters': 'expert_opinion_letters',
  'Business & Personal Plans': 'business_plan',
  'Evidence Review & Packaging': 'evidence_packaging',
};

function mapServiceToCaseType(service) {
  return SERVICE_TO_CASE_TYPE[service] || 'other';
}

// ---------------------------------------------------------------------------
// Case stages (module doc's suggested list, used verbatim)
// ---------------------------------------------------------------------------

const CASE_STAGES = [
  { value: 'intake', label: 'Intake' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'document_collection', label: 'Document Collection' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'review', label: 'Internal Review' },
  { value: 'client_review', label: 'Client Review' },
  { value: 'ready_to_file', label: 'Ready to File' },
  { value: 'filed', label: 'Filed' },
  { value: 'uscis_pending', label: 'USCIS Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];
const CASE_STAGE_VALUES = CASE_STAGES.map((s) => s.value);

// Client-facing stage labels — deliberately friendlier/vaguer than the
// internal operational labels above for a few stages. Mirrors
// src/lib/content/case-constants.ts's CLIENT_STAGE_LABELS exactly. Needed
// server-side (not just in the portal) as of Cycle 6, since this app
// composes client-visible system-message text (systemMessageService.js)
// before that text ever reaches the client's read path.
const CLIENT_STAGE_LABELS = {
  intake: 'Getting started',
  strategy: 'Building your strategy',
  document_collection: 'Collecting documents',
  drafting: 'Preparing your case',
  review: 'Preparing your case',
  client_review: 'Awaiting your review',
  ready_to_file: 'Ready to file',
  filed: 'Filed with USCIS',
  uscis_pending: 'Pending with USCIS',
  approved: 'Approved',
  denied: 'Denied',
  closed: 'Closed',
  archived: 'Archived',
};

// No restrictive transition graph exists in product/repository documentation
// today (see 03_CLIENT_CASES_AND_WORKSPACES.md: "Do not invent a
// restrictive transition graph unless ... already defines one"). This cycle
// validates the destination is a real stage and audits the change — it does
// not enforce an ordering. A future cycle may add one; document that intent
// here rather than silently inventing rules now.

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const WORKSPACE_STATUSES = ['active', 'suspended', 'archived'];
const WORKSPACE_TYPES = ['primary'];

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

const MEMBER_TYPES = ['client', 'employee'];

const WORKSPACE_ROLES = [
  'client',
  'project_manager',
  'case_manager',
  'contributor',
  'reviewer',
  'observer',
];

const MEMBERSHIP_STATUSES = ['invited', 'active', 'removed', 'suspended'];

// Client-facing label for each workspace role — never expose the raw role
// string to the client portal (see module doc: "Internal role codes unless
// intentionally mapped"). Only client-relevant roles get a mapping;
// internal-only roles (case_manager, contributor, reviewer, observer)
// intentionally fall back to a generic label rather than leaking internal
// vocabulary.
const CLIENT_DISPLAY_ROLE_LABELS = {
  client: 'Client',
  project_manager: 'Project Manager',
};
const DEFAULT_CLIENT_DISPLAY_ROLE = 'Team Member';

function clientDisplayRoleLabel(workspaceRole) {
  return CLIENT_DISPLAY_ROLE_LABELS[workspaceRole] || DEFAULT_CLIENT_DISPLAY_ROLE;
}

module.exports = {
  CASE_TYPES,
  CASE_TYPE_VALUES,
  SERVICE_TO_CASE_TYPE,
  mapServiceToCaseType,
  CASE_STAGES,
  CASE_STAGE_VALUES,
  CLIENT_STAGE_LABELS,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
  MEMBER_TYPES,
  WORKSPACE_ROLES,
  MEMBERSHIP_STATUSES,
  CLIENT_DISPLAY_ROLE_LABELS,
  DEFAULT_CLIENT_DISPLAY_ROLE,
  clientDisplayRoleLabel,
};
