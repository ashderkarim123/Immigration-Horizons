/**
 * Mirrors server/utils/documentConstants.js — same values, same shape. See
 * docs/architecture/ADR-004-secure-document-storage.md §5: kept as two
 * independent files (not a shared package), cross-checked by
 * test/document-schema-contract.test.ts (root) and
 * server/test/document-schema-contract.test.js (server).
 */

export const CATEGORY_VISIBILITY = ["client_visible", "employees_only"] as const;
export type CategoryVisibility = (typeof CATEGORY_VISIBILITY)[number];

export const CATEGORY_ALLOWED_UPLOADER_TYPES = ["client", "employee", "both"] as const;
export type CategoryAllowedUploaderType = (typeof CATEGORY_ALLOWED_UPLOADER_TYPES)[number];

export const UPLOADED_BY_TYPE = ["client", "employee"] as const;
export type UploadedByType = (typeof UPLOADED_BY_TYPE)[number];

export const DOCUMENT_VISIBILITY = ["client_visible", "employees_only"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITY)[number];

export const DOCUMENT_STATUSES = [
  "uploaded",
  "quarantined",
  "pending_review",
  "accepted",
  "needs_replacement",
  "rejected",
  "superseded",
  "archived",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SCAN_STATUSES = ["clean", "infected", "error", "not_configured", "pending"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const DOCUMENT_REQUEST_STATUSES = [
  "open",
  "uploaded",
  "under_review",
  "fulfilled",
  "replacement_required",
  "cancelled",
] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

export const ACTIVE_REQUEST_STATUSES = ["open", "uploaded", "under_review", "replacement_required"] as const;

export const DOCUMENT_ACTIVITY_TYPES = [
  "category_provisioned",
  "category_created",
  "category_renamed",
  "category_reordered",
  "category_disabled",
  "category_reactivated",
  "document_requested",
  "document_request_updated",
  "document_request_cancelled",
  "document_uploaded",
  "document_reviewed",
  "document_replacement_uploaded",
  "document_category_changed",
  "document_version_created",
  "document_archived",
] as const;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/tiff",
] as const;

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".jpg", ".jpeg", ".png", ".tif", ".tiff"] as const;

export const MIME_TO_DETECTED_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "image/jpeg": ["jpg"],
  "image/png": ["png"],
  "image/tiff": ["tif"],
};

export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_FILES_PER_REQUEST = 5;

export type DefaultCategoryTemplateEntry = {
  templateKey: string;
  name: string;
  slug: string;
  order: number;
  description: string;
  visibility: CategoryVisibility;
  allowedUploaderTypes: CategoryAllowedUploaderType;
  required: boolean;
};

export const DEFAULT_CATEGORY_TEMPLATE: DefaultCategoryTemplateEntry[] = [
  { templateKey: "identity_civil_documents", name: "Identity and Civil Documents", slug: "identity-civil-documents", order: 1, description: "Passports, birth/marriage certificates, and other civil-status records.", visibility: "client_visible", allowedUploaderTypes: "both", required: true },
  { templateKey: "immigration_history", name: "Immigration History", slug: "immigration-history", order: 2, description: "Prior visas, petitions, status history, and related USCIS correspondence.", visibility: "client_visible", allowedUploaderTypes: "both", required: true },
  { templateKey: "education_academic_records", name: "Education and Academic Records", slug: "education-academic-records", order: 3, description: "Degrees, transcripts, and academic credential evaluations.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "employment_professional_experience", name: "Employment and Professional Experience", slug: "employment-professional-experience", order: 4, description: "Resumes, employment letters, and professional experience records.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "proposed_endeavor_case_strategy", name: "Proposed Endeavor or Case Strategy", slug: "proposed-endeavor-case-strategy", order: 5, description: "Internal case strategy and proposed-endeavor drafting material.", visibility: "employees_only", allowedUploaderTypes: "employee", required: false },
  { templateKey: "awards_memberships_recognition", name: "Awards, Memberships, and Recognition", slug: "awards-memberships-recognition", order: 6, description: "Awards, honors, and professional membership evidence.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "publications_citations_judging_media", name: "Publications, Citations, Judging, and Media", slug: "publications-citations-judging-media", order: 7, description: "Publications, citation records, judging evidence, and media coverage.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "reference_materials", name: "Reference Materials", slug: "reference-materials", order: 8, description: "Supporting reference materials and contact information.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "recommendation_letters", name: "Recommendation Letters", slug: "recommendation-letters", order: 9, description: "Drafted and finalized recommendation letters.", visibility: "client_visible", allowedUploaderTypes: "employee", required: false },
  { templateKey: "expert_opinion_letters", name: "Expert Opinion Letters", slug: "expert-opinion-letters", order: 10, description: "Drafted and finalized expert opinion letters.", visibility: "client_visible", allowedUploaderTypes: "employee", required: false },
  { templateKey: "business_professional_plan", name: "Business Plan or Professional Plan", slug: "business-professional-plan", order: 11, description: "Business plan or professional plan documents.", visibility: "client_visible", allowedUploaderTypes: "employee", required: false },
  { templateKey: "uscis_forms", name: "USCIS Forms", slug: "uscis-forms", order: 12, description: "Prepared USCIS forms for client review and signature.", visibility: "client_visible", allowedUploaderTypes: "employee", required: false },
  { templateKey: "petition_letter", name: "Petition Letter", slug: "petition-letter", order: 13, description: "Internal petition-letter drafting material.", visibility: "employees_only", allowedUploaderTypes: "employee", required: false },
  { templateKey: "exhibits_supporting_evidence", name: "Exhibits and Supporting Evidence", slug: "exhibits-supporting-evidence", order: 14, description: "Numbered exhibits and supporting evidence for the filing.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "rfe_noid_materials", name: "RFE or NOID Materials", slug: "rfe-noid-materials", order: 15, description: "Requests for Evidence, Notices of Intent to Deny, and responsive materials.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
  { templateKey: "filing_package", name: "Filing Package", slug: "filing-package", order: 16, description: "Internal assembled filing package.", visibility: "employees_only", allowedUploaderTypes: "employee", required: false },
  { templateKey: "uscis_receipts_notices", name: "USCIS Receipts and Notices", slug: "uscis-receipts-notices", order: 17, description: "Official USCIS receipt notices and correspondence.", visibility: "client_visible", allowedUploaderTypes: "employee", required: false },
  { templateKey: "final_decisions", name: "Final Decisions", slug: "final-decisions", order: 18, description: "Final USCIS decision notices.", visibility: "client_visible", allowedUploaderTypes: "employee", required: false },
  { templateKey: "other", name: "Other", slug: "other", order: 19, description: "Documents that do not fit another category.", visibility: "client_visible", allowedUploaderTypes: "both", required: false },
];
