import { DependencyType, DocumentRole, PetitionStatus, SectionReviewStatus } from '../../../../core/api/petition.types';

/** Display vocabulary for the Petition tab. Labels are plain words, never scores. */

export const PETITION_STATUS_LABELS: Record<PetitionStatus, string> = {
  drafting: 'Drafting',
  internal_review: 'In internal review',
  needs_changes: 'Changes requested',
  approved: 'Approved',
  finalized: 'Finalized',
  archived: 'Archived',
};

/** `variant` of the shared status badge - explicit, because `locked`/`archived`-style words would auto-colour as danger. */
export const PETITION_STATUS_VARIANTS: Record<PetitionStatus, 'neutral' | 'purple' | 'warning' | 'success' | 'info'> = {
  drafting: 'neutral',
  internal_review: 'purple',
  needs_changes: 'warning',
  approved: 'success',
  finalized: 'info',
  archived: 'neutral',
};

export const SECTION_STATUS_LABELS: Record<SectionReviewStatus, string> = {
  draft: 'Draft',
  ready_for_review: 'Ready for review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

export const SECTION_STATUS_VARIANTS: Record<SectionReviewStatus, 'neutral' | 'purple' | 'warning' | 'success'> = {
  draft: 'neutral',
  ready_for_review: 'purple',
  changes_requested: 'warning',
  approved: 'success',
};

export const DEPENDENCY_TYPES: DependencyType[] = ['evidence_requirement', 'smart_form', 'case_document', 'task'];

export const DEPENDENCY_LABELS: Record<DependencyType, string> = {
  evidence_requirement: 'Evidence',
  smart_form: 'Forms',
  case_document: 'Documents',
  task: 'Tasks',
};

export const DOCUMENT_ROLES: { value: DocumentRole; label: string }[] = [
  { value: 'supporting_document', label: 'Supporting document' },
  { value: 'business_plan', label: 'Business plan' },
  { value: 'recommendation_letter', label: 'Recommendation letter' },
  { value: 'expert_opinion_letter', label: 'Expert opinion letter' },
  { value: 'other', label: 'Other' },
];

/** The immigration-specific wording stays out of the UI: a petition-kind label is just the kind, humanised. */
export const humanizeKind = (kind: string): string => kind.replace(/_/g, ' ');
