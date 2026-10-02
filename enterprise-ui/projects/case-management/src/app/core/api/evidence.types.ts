/** DTOs for the evidence API, shaped like server/services/evidenceManagement.js. */

export type EvidenceImportance = 'required' | 'recommended' | 'optional';
export type EvidenceStatus = 'missing' | 'in_progress' | 'satisfied' | 'waived' | 'not_applicable';

/** GET /staff/cases/:caseId/evidence/templates — active templates for the case's type. */
export interface EvidenceTemplateSummary {
  key: string;
  name: string;
  description: string;
  caseType: string;
  version: number;
  itemCount: number;
}

export interface EvidenceLinkedDocument {
  id: string;
  displayName: string;
  status: string;
}

export interface EvidenceRequirementDetail {
  id: string;
  caseId: string;
  workspaceId: string;
  source: 'template' | 'custom';
  templateKey: string | null;
  templateVersion: number | null;
  templateItemKey: string | null;
  section: string;
  order: number;
  title: string;
  description: string;
  importance: EvidenceImportance;
  status: EvidenceStatus;
  clientVisible: boolean;
  clientGuidance: string;
  staffGuidance: string;
  internalNotes: string;
  linkedDocuments: EvidenceLinkedDocument[];
  waivedReason: string | null;
  notApplicableReason: string | null;
  satisfiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceSummary {
  total: number;
  requiredTotal: number;
  requiredSatisfied: number;
  missing: number;
  inProgress: number;
  satisfied: number;
  waived: number;
  notApplicable: number;
  completionPercent: number;
}

export interface EvidenceListResponse {
  requirements: EvidenceRequirementDetail[];
  summary: EvidenceSummary;
  /** Server-derived: whether this actor may change the checklist on this case. */
  actions: { canManage: boolean };
}

export interface EvidenceProvisionResult {
  created: number;
  skipped: number;
  template: { key: string; version: number };
}

/** GET /staff/cases/:caseId/evidence/eligible-documents */
export interface EligibleDocument {
  id: string;
  displayName: string;
  status: string;
}
