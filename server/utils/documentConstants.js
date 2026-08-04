/**
 * Centralized document-management vocabulary. Mirrored (not shared at
 * runtime) by src/lib/content/document-constants.ts — see
 * docs/architecture/ADR-004-secure-document-storage.md §5 and
 * server/test/document-schema-contract.test.js.
 */

const CATEGORY_VISIBILITY = ['client_visible', 'employees_only'];

// Who is allowed to upload *into* a category.
const CATEGORY_ALLOWED_UPLOADER_TYPES = ['client', 'employee', 'both'];

// The actual identity of who uploaded a given document (never trusted from
// the browser — always derived from the authenticated actor).
const UPLOADED_BY_TYPE = ['client', 'employee'];

const DOCUMENT_VISIBILITY = ['client_visible', 'employees_only'];

const DOCUMENT_STATUSES = [
  'uploaded',
  'quarantined',
  'pending_review',
  'accepted',
  'needs_replacement',
  'rejected',
  'superseded',
  'archived',
];

const SCAN_STATUSES = ['clean', 'infected', 'error', 'not_configured', 'pending'];

const DOCUMENT_REQUEST_STATUSES = [
  'open',
  'uploaded',
  'under_review',
  'fulfilled',
  'replacement_required',
  'cancelled',
];

// Statuses a request is still considered "active" for (used to derive
// overdue rather than storing it — module doc §15: "Do not store 'overdue'
// as a permanent status").
const ACTIVE_REQUEST_STATUSES = ['open', 'uploaded', 'under_review', 'replacement_required'];

const DOCUMENT_ACTIVITY_TYPES = [
  'category_provisioned',
  'category_created',
  'category_renamed',
  'category_reordered',
  'category_disabled',
  'category_reactivated',
  'document_requested',
  'document_request_updated',
  'document_request_cancelled',
  'document_uploaded',
  'document_reviewed',
  'document_replacement_uploaded',
  'document_category_changed',
  'document_version_created',
  'document_archived',
];

// Allowed file types this cycle — conservative allowlist, see ADR-004 §9.
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'image/jpeg',
  'image/png',
  'image/tiff',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png', '.tif', '.tiff'];

// file-type's detected `.ext`/`.mime` values for the allowed types above —
// used to cross-check the declared MIME/extension against the actual bytes.
const MIME_TO_DETECTED_EXTENSIONS = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'image/jpeg': ['jpg'],
  'image/png': ['png'],
  'image/tiff': ['tif'],
};

const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const DEFAULT_MAX_FILES_PER_REQUEST = 5;

/**
 * Default immigration-document category template — see module doc
 * "Default category order" and ADR-004's visibility-default guidance
 * (internal strategy/drafting material stays employees_only; anything the
 * client would naturally supply, review, or receive is client_visible).
 */
const DEFAULT_CATEGORY_TEMPLATE = [
  { templateKey: 'identity_civil_documents', name: 'Identity and Civil Documents', slug: 'identity-civil-documents', order: 1, description: 'Passports, birth/marriage certificates, and other civil-status records.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: true },
  { templateKey: 'immigration_history', name: 'Immigration History', slug: 'immigration-history', order: 2, description: 'Prior visas, petitions, status history, and related USCIS correspondence.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: true },
  { templateKey: 'education_academic_records', name: 'Education and Academic Records', slug: 'education-academic-records', order: 3, description: 'Degrees, transcripts, and academic credential evaluations.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'employment_professional_experience', name: 'Employment and Professional Experience', slug: 'employment-professional-experience', order: 4, description: 'Resumes, employment letters, and professional experience records.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'proposed_endeavor_case_strategy', name: 'Proposed Endeavor or Case Strategy', slug: 'proposed-endeavor-case-strategy', order: 5, description: 'Internal case strategy and proposed-endeavor drafting material.', visibility: 'employees_only', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'awards_memberships_recognition', name: 'Awards, Memberships, and Recognition', slug: 'awards-memberships-recognition', order: 6, description: 'Awards, honors, and professional membership evidence.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'publications_citations_judging_media', name: 'Publications, Citations, Judging, and Media', slug: 'publications-citations-judging-media', order: 7, description: 'Publications, citation records, judging evidence, and media coverage.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'reference_materials', name: 'Reference Materials', slug: 'reference-materials', order: 8, description: 'Supporting reference materials and contact information.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'recommendation_letters', name: 'Recommendation Letters', slug: 'recommendation-letters', order: 9, description: 'Drafted and finalized recommendation letters.', visibility: 'client_visible', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'expert_opinion_letters', name: 'Expert Opinion Letters', slug: 'expert-opinion-letters', order: 10, description: 'Drafted and finalized expert opinion letters.', visibility: 'client_visible', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'business_professional_plan', name: 'Business Plan or Professional Plan', slug: 'business-professional-plan', order: 11, description: 'Business plan or professional plan documents.', visibility: 'client_visible', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'uscis_forms', name: 'USCIS Forms', slug: 'uscis-forms', order: 12, description: 'Prepared USCIS forms for client review and signature.', visibility: 'client_visible', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'petition_letter', name: 'Petition Letter', slug: 'petition-letter', order: 13, description: 'Internal petition-letter drafting material.', visibility: 'employees_only', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'exhibits_supporting_evidence', name: 'Exhibits and Supporting Evidence', slug: 'exhibits-supporting-evidence', order: 14, description: 'Numbered exhibits and supporting evidence for the filing.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'rfe_noid_materials', name: 'RFE or NOID Materials', slug: 'rfe-noid-materials', order: 15, description: 'Requests for Evidence, Notices of Intent to Deny, and responsive materials.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
  { templateKey: 'filing_package', name: 'Filing Package', slug: 'filing-package', order: 16, description: 'Internal assembled filing package.', visibility: 'employees_only', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'uscis_receipts_notices', name: 'USCIS Receipts and Notices', slug: 'uscis-receipts-notices', order: 17, description: 'Official USCIS receipt notices and correspondence.', visibility: 'client_visible', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'final_decisions', name: 'Final Decisions', slug: 'final-decisions', order: 18, description: 'Final USCIS decision notices.', visibility: 'client_visible', allowedUploaderTypes: 'employee', required: false },
  { templateKey: 'other', name: 'Other', slug: 'other', order: 19, description: 'Documents that do not fit another category.', visibility: 'client_visible', allowedUploaderTypes: 'both', required: false },
];

module.exports = {
  CATEGORY_VISIBILITY,
  CATEGORY_ALLOWED_UPLOADER_TYPES,
  UPLOADED_BY_TYPE,
  DOCUMENT_VISIBILITY,
  DOCUMENT_STATUSES,
  SCAN_STATUSES,
  DOCUMENT_REQUEST_STATUSES,
  ACTIVE_REQUEST_STATUSES,
  DOCUMENT_ACTIVITY_TYPES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MIME_TO_DETECTED_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_REQUEST,
  DEFAULT_CATEGORY_TEMPLATE,
};
