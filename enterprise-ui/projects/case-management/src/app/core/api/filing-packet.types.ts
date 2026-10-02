/** Wire contract of /api/v1/staff Filing Packet endpoints (ADR-023 §24/§26). Staff-only. A packet is a MANIFEST; no files are generated. */

export type PacketKind = 'initial_filing' | 'rfe_response' | 'noid_response' | 'supplemental' | 'other';
export type PacketStatus = 'draft' | 'review' | 'needs_changes' | 'approved' | 'finalized' | 'archived';
export type PacketItemType = 'document_version' | 'smart_form_reference';
export type PacketRole =
  | 'cover_sheet'
  | 'petition_letter'
  | 'uscis_form'
  | 'supporting_evidence'
  | 'recommendation_letter'
  | 'expert_opinion_letter'
  | 'business_plan'
  | 'identity_civil'
  | 'immigration_history'
  | 'exhibit'
  | 'other';
export type CandidateType = 'petition_version' | 'document_version' | 'smart_form';

export interface PacketActions {
  canManage: boolean;
  canSubmit: boolean;
  canReturn: boolean;
  canApprove: boolean;
  canFinalize: boolean;
}

/** Operational readiness only - never a statement about legal sufficiency. */
export interface PacketReadiness {
  ready: boolean;
  petitionReady: boolean;
  requiredReady: number;
  requiredTotal: number;
}

export interface PacketSummary {
  id: string;
  caseId: string;
  sequence: number;
  kind: PacketKind;
  title: string;
  status: PacketStatus;
  revision: number;
  itemCount: number;
  readiness: PacketReadiness;
  updatedAt: string | null;
  actions: PacketActions;
}

export interface PetitionSource {
  required: boolean;
  present: boolean;
  ready: boolean;
  status: string;
  reason: string;
  petitionVersionId: string | null;
  versionNumber: number | null;
  title: string;
}

export interface DownloadAction {
  documentId: string;
  versionId: string;
}

/** Safe source summary: a document version (ids, number, type, size, category) or a Smart Form reference (template, revision). Never storage metadata. */
export interface PacketItemSource {
  documentId?: string;
  documentVersionId?: string;
  versionNumber?: number;
  mimeType?: string;
  size?: number;
  categoryName?: string;
  /** Set when the live document has a newer version than the pinned one. */
  currentVersionNumber?: number | null;
  caseSmartFormId?: string;
  templateKey?: string;
  templateVersion?: number;
  revision?: number;
  lockedRevision?: number | null;
}

export interface PacketItem {
  id: string;
  type: PacketItemType;
  role: PacketRole;
  label: string;
  order: number;
  required: boolean;
  notes: string;
  ready: boolean;
  status: string;
  reason: string;
  source: PacketItemSource | null;
  downloadAction: DownloadAction | null;
}

export interface PacketVersionSummary {
  id: string;
  versionNumber: number;
  manifestHash: string;
  createdByName: string;
  createdAt: string | null;
}

export interface PacketDetail extends PacketSummary {
  description: string;
  petitionSource: PetitionSource;
  items: PacketItem[];
  internalReviewNote: string;
  approvedAt: string | null;
  approvedByName: string;
  finalizedAt: string | null;
  finalizedByName: string;
  versions: PacketVersionSummary[];
}

export interface PacketList {
  packets: PacketSummary[];
  canProvision: boolean;
}

export interface PacketVersionDetail extends PacketVersionSummary {
  packetId: string;
  kind: PacketKind;
  title: string;
  description: string;
  sourceRevision: number;
  petitionSource: {
    petitionVersionId: string;
    petitionId: string;
    versionNumber: number;
    sourceRevision: number;
    petitionKind: string;
    petitionTitle: string;
    createdAt: string | null;
  } | null;
  items: {
    order: number;
    type: PacketItemType;
    role: PacketRole;
    required: boolean;
    label: string;
    notes: string;
    status: string;
    source: PacketItemSource;
    downloadAction: DownloadAction | null;
  }[];
}

export interface PacketCandidate {
  linked: boolean;
  // petition_version
  petitionVersionId?: string;
  versionNumber?: number;
  title?: string;
  // document_version
  documentId?: string;
  versionId?: string;
  displayName?: string;
  categoryName?: string;
  status?: string;
  mimeType?: string;
  size?: number;
  // smart_form
  smartFormId?: string;
  revision?: number;
}

/** `{ error: { code, message, fieldErrors } }` - 409s carry `{ revision, status }` in fieldErrors. */
export interface PacketApiError {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string | number> | null;
  };
}
