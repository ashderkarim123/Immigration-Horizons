const DocumentRequest = require('../models/DocumentRequest');
const DocumentCategory = require('../models/DocumentCategory');
const WorkspaceMember = require('../models/WorkspaceMember');
const CaseActivity = require('../models/CaseActivity');
const ClientCase = require('../models/ClientCase');
const { notifyClient } = require('./notificationService');

const {
  sendDocumentRequestCreatedEmail,
  sendDocumentRequestDueDateChangedEmail,
  sendDocumentRequestCancelledEmail,
} = require('./documentEmail');

async function notifyRequestClientEmail(request, sendFn, extra = {}) {
  try {
    const member = await WorkspaceMember.findById(request.requestedFrom).populate('clientUser', 'email firstName').lean();
    const caseDoc = await ClientCase.findById(request.case).select('caseNumber').lean();
    if (!member || !member.clientUser || !caseDoc) return;
    await sendFn({
      to: member.clientUser.email,
      firstName: member.clientUser.firstName,
      caseNumber: caseDoc.caseNumber,
      requestTitle: request.title,
      ...extra,
    });
  } catch (err) {
    console.error('[documents] request client email failed:', err.message);
  }
}

/** The in-app counterpart to notifyRequestClientEmail (Cycle 7 — ADR-006 §6). */
async function notifyRequestClientInApp(request, { type, title, message }) {
  try {
    const member = await WorkspaceMember.findById(request.requestedFrom).select('clientUser workspace').lean();
    if (!member || !member.clientUser) return;
    await notifyClient({
      clientUserId: member.clientUser,
      requireActiveWorkspace: request.workspace,
      title,
      message,
      type,
      relatedCase: request.case,
      relatedDocumentRequest: request._id,
    });
  } catch (err) {
    console.error('[documents] request client in-app notification failed:', err.message);
  }
}

async function createDocumentRequest({
  caseId,
  workspaceId,
  categoryId,
  title,
  instructions,
  requestedFromMemberId,
  requestedByAdminId,
  dueDate,
  actor,
}) {
  if (!title || !title.trim()) {
    return { outcome: 'validation_error', errors: { title: 'Title is required.' } };
  }

  const category = await DocumentCategory.findOne({ _id: categoryId, case: caseId, active: true });
  if (!category) {
    return { outcome: 'validation_error', errors: { category: 'Category not found for this case.' } };
  }

  // requestedFrom must be an active-or-invited CLIENT member of THIS
  // workspace — never an arbitrary ClientUser id (module doc §15).
  const member = await WorkspaceMember.findOne({
    _id: requestedFromMemberId,
    workspace: workspaceId,
    memberType: 'client',
    status: { $in: ['active', 'invited'] },
  });
  if (!member) {
    return { outcome: 'validation_error', errors: { requestedFrom: 'Not a valid, active client member of this case.' } };
  }

  const request = await DocumentRequest.create({
    case: caseId,
    workspace: workspaceId,
    category: categoryId,
    title: title.trim(),
    instructions: (instructions || '').trim(),
    requestedFrom: member._id,
    requestedBy: requestedByAdminId,
    dueDate: dueDate ? new Date(dueDate) : null,
    status: 'open',
  });

  try {
    await CaseActivity.record({
      caseId,
      workspaceId,
      type: 'document_requested',
      message: `"${request.title}" requested by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after creating a request:', err.message);
  }

  await notifyRequestClientEmail(request, sendDocumentRequestCreatedEmail, { dueDate: request.dueDate });
  await notifyRequestClientInApp(request, {
    type: 'document_requested',
    title: 'Document requested',
    message: `We requested "${request.title}" for your case.`,
  });

  return { outcome: 'created', request };
}

async function updateDocumentRequest({ requestId, dueDate, instructions, clientVisibleComment, actor }) {
  const request = await DocumentRequest.findById(requestId);
  if (!request) return { outcome: 'not_found' };

  const nextDueDate = dueDate ? new Date(dueDate) : null;
  const dueDateChanged = (request.dueDate ? request.dueDate.getTime() : null) !== (nextDueDate ? nextDueDate.getTime() : null);

  request.dueDate = nextDueDate;
  if (typeof instructions === 'string') request.instructions = instructions.trim();
  if (typeof clientVisibleComment === 'string') request.clientVisibleComment = clientVisibleComment.trim();
  await request.save();

  try {
    await CaseActivity.record({
      caseId: request.case,
      workspaceId: request.workspace,
      type: 'document_request_updated',
      message: `"${request.title}" updated by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after updating a request:', err.message);
  }

  if (dueDateChanged) {
    await notifyRequestClientEmail(request, sendDocumentRequestDueDateChangedEmail, { dueDate: request.dueDate });
    await notifyRequestClientInApp(request, {
      type: 'document_request_updated',
      title: 'Document request updated',
      message: `The due date for "${request.title}" changed.`,
    });
  }

  return { outcome: 'updated', request };
}

async function cancelDocumentRequest({ requestId, actor }) {
  const request = await DocumentRequest.findById(requestId);
  if (!request) return { outcome: 'not_found' };
  if (request.status === 'cancelled') return { outcome: 'unchanged', request };

  request.status = 'cancelled';
  request.cancelledAt = new Date();
  await request.save();

  try {
    await CaseActivity.record({
      caseId: request.case,
      workspaceId: request.workspace,
      type: 'document_request_cancelled',
      message: `"${request.title}" cancelled by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after cancelling a request:', err.message);
  }

  await notifyRequestClientEmail(request, sendDocumentRequestCancelledEmail);
  await notifyRequestClientInApp(request, {
    type: 'document_request_cancelled',
    title: 'Document request cancelled',
    message: `The request "${request.title}" was cancelled.`,
  });

  return { outcome: 'updated', request };
}

module.exports = { createDocumentRequest, updateDocumentRequest, cancelDocumentRequest };
