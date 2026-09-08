export interface EvidenceTemplateItem {
  key: string;
  title: string;
  description: string;
  importance: 'required' | 'recommended' | 'optional';
  section: string;
  order: number;
  clientGuidance: string;
  staffGuidance: string;
  suggestedCategoryKey: string;
}

export interface EvidenceTemplate {
  key: string;
  name: string;
  description: string;
  caseType: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  items: EvidenceTemplateItem[];
}

export interface EvidenceRequirementDetail {
  _id: string;
  case: string;
  workspace: string;
  source: 'template' | 'custom';
  templateKey?: string;
  templateVersion?: number;
  templateItemKey?: string;
  section: string;
  order: number;
  title: string;
  description: string;
  importance: 'required' | 'recommended' | 'optional';
  status: 'missing' | 'in_progress' | 'satisfied' | 'waived' | 'not_applicable';
  clientVisible: boolean;
  clientGuidance: string;
  staffGuidance: string;
  internalNotes: string;
  linkedCategories: string[];
  linkedDocuments: { _id: string; name: string; status: string }[];
  linkedRequests: string[];
  waivedReason?: string;
  notApplicableReason?: string;
  satisfiedAt?: string;
  satisfiedBy?: string;
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
}

export interface EvidenceStatusUpdateRequest {
  status: 'missing' | 'in_progress' | 'satisfied' | 'waived' | 'not_applicable';
  reason?: string;
}

export interface EvidenceProvisionRequest {
  templateKey: string;
  version?: number;
}

export interface CustomRequirementRequest {
  title: string;
  description?: string;
  importance?: 'required' | 'recommended' | 'optional';
  section?: string;
  order?: number;
  internalNotes?: string;
  clientVisible?: boolean;
}
