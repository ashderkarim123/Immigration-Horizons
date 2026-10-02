export interface DocumentActor {
  id: string;
  type: 'client' | 'employee';
  displayName: string;
}

export interface DocumentCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  order: number;
  visibility: 'client_visible' | 'employees_only';
  allowedUploaderTypes: 'client' | 'employee' | 'both';
  required: boolean;
  active: boolean;
  templateKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDocument {
  id: string;
  displayName: string;
  originalName: string;
  category: Pick<DocumentCategory, 'id' | 'name'> | null;
  status: string;
  visibility: string;
  mimeType: string;
  extension: string;
  size: number;
  scanStatus: string;
  uploadedBy: DocumentActor | null;
  uploadedAt: string;
  reviewedBy: DocumentActor | null;
  reviewedAt: string | null;
  clientVisibleReviewComment: string;
  internalReviewComment: string;
  currentVersionNumber: number;
  versionCount: number;
  documentRequestId: string | null;
  evidenceCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  versionNumber: number;
  displayName: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  scanStatus: string;
  uploadedBy: DocumentActor | null;
  changeNote: string;
  uploadedAt: string;
}

export interface DocumentRequest {
  id: string;
  category: Pick<DocumentCategory, 'id' | 'name'> | null;
  title: string;
  instructions: string;
  requestedFrom: { id: string; client: DocumentActor | null } | null;
  requestedBy: DocumentActor | null;
  dueDate: string | null;
  status: string;
  fulfilledByDocumentId: string | null;
  fulfilledAt: string | null;
  clientVisibleComment: string;
  internalComment: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentCapabilities {
  canUpload: boolean;
  canReview: boolean;
  canArchive: boolean;
  canManageCategories: boolean;
  canManageRequests: boolean;
  canViewVersions: boolean;
}

export interface DocumentCenter {
  case: { id: string; caseNumber: string; title: string };
  categories: DocumentCategory[];
  documents: StaffDocument[];
  requests: DocumentRequest[];
  clientMembers: { id: string; client: DocumentActor | null; status: string }[];
  capabilities: DocumentCapabilities;
}

export interface DocumentDetail {
  case: { id: string };
  document: StaffDocument;
  request: DocumentRequest | null;
  versions: DocumentVersion[];
  relatedEvidence: { id: string; title: string; section: string; status: string; importance: string }[];
  capabilities: DocumentCapabilities;
}
