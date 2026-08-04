const { can, getRole } = require('../utils/permissions');
const { hasActiveEmployeeMembership } = require('./casePolicy');

/**
 * Centralized row-level document authorization (employee side). Same
 * capability-plus-membership shape as casePolicy.js/interactionPolicy.js —
 * see docs/architecture/ADR-004-secure-document-storage.md §14 and
 * 05_DOCUMENT_MANAGEMENT.md §19/§20. Reuses casePolicy's
 * `hasActiveEmployeeMembership` directly rather than duplicating it — a
 * workspace membership means the same thing regardless of which
 * case-scoped domain is asking.
 */

async function authorizeDocumentAction(req, workspaceId, capability) {
  if (!getRole(req)) return false; // missing role fails closed
  if (!can(req, capability)) return false;
  if (can(req, 'documents.view_all')) return true;
  return hasActiveEmployeeMembership(req, workspaceId);
}

async function canViewDocumentCenter(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'documents.view');
}

async function canUploadDocument(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'documents.upload');
}

async function canReviewDocument(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'documents.review');
}

async function canArchiveDocument(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'documents.archive');
}

async function canManageCategories(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'document_categories.manage');
}

async function canManageDocumentRequests(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'document_requests.manage');
}

async function canViewDocumentVersions(req, workspaceId) {
  return authorizeDocumentAction(req, workspaceId, 'document_versions.view');
}

module.exports = {
  authorizeDocumentAction,
  canViewDocumentCenter,
  canUploadDocument,
  canReviewDocument,
  canArchiveDocument,
  canManageCategories,
  canManageDocumentRequests,
  canViewDocumentVersions,
};
