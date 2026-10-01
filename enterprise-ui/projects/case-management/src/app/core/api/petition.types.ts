/** Wire contract of /api/v1/staff Petition Work endpoints (ADR-022 §21/§22). Staff-only. */

export type PetitionKind = 'primary' | 'rfe_response' | 'noid_response' | 'supplemental' | 'other';
export type PetitionStatus = 'drafting' | 'internal_review' | 'needs_changes' | 'approved' | 'finalized' | 'archived';
export type SectionReviewStatus = 'draft' | 'ready_for_review' | 'changes_requested' | 'approved';
export type DependencyType = 'evidence_requirement' | 'smart_form' | 'case_document' | 'task';
export type DocumentRole = 'business_plan' | 'recommendation_letter' | 'expert_opinion_letter' | 'supporting_document' | 'other';

export interface PetitionActions {
  canManage: boolean;
  canEdit: boolean;
  canLink: boolean;
  canSubmit: boolean;
  canReturn: boolean;
  canApprove: boolean;
  canFinalize: boolean;
}

/** Operational completion counts only - never a legal-strength score. */
export interface PetitionSectionProgress {
  approved: number;
  total: number;
}
export interface PetitionDependencyProgress {
  ready: number;
  total: number;
}

export interface PetitionSummary {
  id: string;
  caseId: string;
  sequence: number;
  kind: PetitionKind;
  title: string;
  status: PetitionStatus;
  revision: number;
  sectionProgress: PetitionSectionProgress;
  dependencyProgress: PetitionDependencyProgress;
  updatedAt: string | null;
  actions: PetitionActions;
}

export interface PetitionSectionActions {
  canEdit: boolean;
  canMarkReady: boolean;
  canReturn: boolean;
  canApprove: boolean;
  canAssign: boolean;
}

export interface PetitionSection {
  key: string;
  title: string;
  order: number;
  required: boolean;
  body: string;
  reviewStatus: SectionReviewStatus;
  assignee: { id: string; name: string } | null;
  lastEditedAt: string | null;
  lastEditedByName: string;
  reviewedAt: string | null;
  reviewedByName: string;
  reviewNote: string;
  actions: PetitionSectionActions;
}

export interface PetitionDependency {
  id: string;
  type: DependencyType;
  refId: string;
  label: string;
  role: DocumentRole | null;
  requiredForFinalization: boolean;
  ready: boolean;
  status: string;
  reason: string;
}

export interface PetitionVersionSummary {
  id: string;
  versionNumber: number;
  reason: 'approval' | 'finalization';
  sourceRevision: number;
  createdByName: string;
  createdAt: string | null;
}

export interface PetitionDetail extends PetitionSummary {
  description: string;
  sections: PetitionSection[];
  dependencies: PetitionDependency[];
  internalReviewNote: string;
  approvedAt: string | null;
  finalizedAt: string | null;
  versions: PetitionVersionSummary[];
}

export interface PetitionList {
  petitions: PetitionSummary[];
  canProvision: boolean;
}

export interface PetitionVersionDetail extends PetitionVersionSummary {
  petitionId: string;
  kind: PetitionKind;
  title: string;
  status: PetitionStatus;
  sections: {
    key: string;
    title: string;
    order: number;
    required: boolean;
    body: string;
    reviewStatus: SectionReviewStatus;
    assignedToName: string;
    reviewedByName: string;
    reviewNote: string;
  }[];
  dependencies: {
    type: DependencyType;
    refId: string;
    label: string;
    role: DocumentRole | null;
    requiredForFinalization: boolean;
    ready: boolean;
    status: string;
    provenance: Record<string, string | number | null> | null;
  }[];
}

export interface DependencyCandidate {
  refId: string;
  label: string;
  status: string;
  linked: boolean;
}

/** `{ error: { code, message, fieldErrors } }` - 409s carry `{ revision, status }` in fieldErrors. */
export interface PetitionApiError {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string | number> | null;
  };
}
