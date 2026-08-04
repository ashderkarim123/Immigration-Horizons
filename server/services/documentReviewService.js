const CaseDocument = require('../models/CaseDocument');
const DocumentCategory = require('../models/DocumentCategory');
const DocumentRequest = require('../models/DocumentRequest');
const CaseActivity = require('../models/CaseActivity');
const ClientUser = require('../models/ClientUser');
const ClientCase = require('../models/ClientCase');

const { saveGuarded } = require('./documentUploadService');
const {
  sendDocumentAcceptedEmail,
  sendReplacementRequestedEmail,
  sendDocumentRejectedEmail,
} = require('./documentEmail');

/** Best-effort client email — never rolls back the review mutation that triggered it. */
async function notifyClientEmail(document, sendFn, extra = {}) {
  try {
    if (!document.uploadedByClient) return; // an employee-uploaded document has no client to notify
    const client = await ClientUser.findById(document.uploadedByClient).select('email firstName').lean();
    const caseDoc = await ClientCase.findById(document.case).select('caseNumber').lean();
    if (!client || !caseDoc) return;
    await sendFn({
      to: client.email,
      firstName: client.firstName,
      caseNumber: caseDoc.caseNumber,
      documentName: document.displayName,
      ...extra,
    });
  } catch (err) {
    console.error('[documents] client email failed:', err.message);
  }
}

/**
 * Sets a document's review outcome. Idempotent for an unchanged repeat
 * request (module doc §23 "Unchanged review") — no duplicate audit event,
 * no duplicate email, no timestamp churn.
 */
async function reviewDocument({ documentId, decision, clientVisibleReviewComment, internalReviewComment, actor }) {
  const document = await CaseDocument.findById(documentId);
  if (!document) return { outcome: 'not_found' };

  if (decision === 'needs_replacement' || decision === 'rejected') {
    if (!clientVisibleReviewComment || !clientVisibleReviewComment.trim()) {
      return { outcome: 'validation_error', errors: { clientVisibleReviewComment: 'A client-visible reason is required.' } };
    }
  }

  const unchanged =
    document.status === decision &&
    document.reviewedBy &&
    String(document.reviewedBy) === String(actor.id) &&
    (document.clientVisibleReviewComment || '') === (clientVisibleReviewComment || '');
  if (unchanged) return { outcome: 'unchanged', document };

  document.status = decision;
  document.reviewedBy = actor.id;
  document.reviewedAt = new Date();
  document.clientVisibleReviewComment = (clientVisibleReviewComment || '').trim();
  document.internalReviewComment = (internalReviewComment || '').trim();
  await saveGuarded(document);

  if (document.documentRequest) {
    const request = await DocumentRequest.findById(document.documentRequest);
    if (request) {
      if (decision === 'accepted') {
        request.status = 'fulfilled';
        request.fulfilledByDocument = document._id;
        request.fulfilledAt = new Date();
      } else if (decision === 'needs_replacement') {
        request.status = 'replacement_required';
      }
      await request.save();
    }
  }

  try {
    await CaseActivity.record({
      caseId: document.case,
      workspaceId: document.workspace,
      type: 'document_reviewed',
      message: `"${document.displayName}" reviewed by ${actor.name}: ${decision}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after a successful review:', err.message);
  }

  if (decision === 'accepted') {
    await notifyClientEmail(document, sendDocumentAcceptedEmail);
  } else if (decision === 'needs_replacement') {
    await notifyClientEmail(document, sendReplacementRequestedEmail, { reason: document.clientVisibleReviewComment });
  } else if (decision === 'rejected') {
    await notifyClientEmail(document, sendDocumentRejectedEmail, { reason: document.clientVisibleReviewComment });
  }

  return { outcome: 'updated', document };
}

/** Moves a document to a different category within the same case (module doc §23 "Move category"). */
async function moveDocumentCategory({ documentId, newCategoryId, actor }) {
  const document = await CaseDocument.findById(documentId);
  if (!document) return { outcome: 'not_found' };

  const newCategory = await DocumentCategory.findOne({ _id: newCategoryId, case: document.case, active: true });
  if (!newCategory) {
    return { outcome: 'validation_error', errors: { category: 'Target category not found for this case.' } };
  }
  if (String(document.category) === String(newCategoryId)) return { outcome: 'unchanged', document };

  const previousCategoryId = document.category;
  document.category = newCategory._id;
  // Re-evaluate visibility when moving between client-visible and
  // employees-only categories — never silently leak an internal file.
  document.visibility = newCategory.visibility;
  await saveGuarded(document);

  try {
    await CaseActivity.record({
      caseId: document.case,
      workspaceId: document.workspace,
      type: 'document_category_changed',
      message: `"${document.displayName}" moved to category "${newCategory.name}" by ${actor.name}.`,
      actor,
      meta: { previousCategoryId, newCategoryId: newCategory._id },
    });
  } catch (err) {
    console.error('[documents] audit failed after a category move:', err.message);
  }

  return { outcome: 'updated', document };
}

async function archiveDocument({ documentId, actor }) {
  const document = await CaseDocument.findById(documentId);
  if (!document) return { outcome: 'not_found' };
  if (document.status === 'archived') return { outcome: 'unchanged', document };

  document.status = 'archived';
  document.archivedAt = new Date();
  await saveGuarded(document);

  try {
    await CaseActivity.record({
      caseId: document.case,
      workspaceId: document.workspace,
      type: 'document_archived',
      message: `"${document.displayName}" archived by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after archiving:', err.message);
  }

  return { outcome: 'updated', document };
}

module.exports = { reviewDocument, moveDocumentCategory, archiveDocument };
