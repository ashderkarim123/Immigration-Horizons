const mongoose = require('mongoose');
const { DOCUMENT_REQUEST_STATUSES } = require('../utils/documentConstants');

/**
 * A checklist item asking a specific client workspace member to supply a
 * document. See docs/architecture/ADR-004-secure-document-storage.md.
 * `requestedFrom` is deliberately a `WorkspaceMember` reference, not a bare
 * `ClientUser` id (module doc §15: "must reference an active or invited
 * client workspace member... not an arbitrary ClientUser ID") — this is
 * what lets fulfillment authorization reuse the exact same membership check
 * every other client-facing route already uses.
 *
 * "Overdue" is deliberately not a stored status — it is derived from
 * `dueDate < now` while `status` is still one of ACTIVE_REQUEST_STATUSES
 * (module doc §15: "Do not store 'overdue' as a permanent status").
 */
const DocumentRequestSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCategory', required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, default: '', trim: true, maxlength: 2000 },

    requestedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMember', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },

    dueDate: { type: Date, default: null },
    status: { type: String, enum: DOCUMENT_REQUEST_STATUSES, default: 'open' },

    fulfilledByDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument', default: null },
    fulfilledAt: { type: Date, default: null },

    clientVisibleComment: { type: String, default: '', maxlength: 1000 },
    internalComment: { type: String, default: '', maxlength: 1000 },

    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DocumentRequestSchema.pre('validate', function () {
  if (this.status === 'fulfilled' && (!this.fulfilledByDocument || !this.fulfilledAt)) {
    throw new Error('status "fulfilled" requires fulfilledByDocument and fulfilledAt.');
  }
  if (this.status === 'cancelled' && !this.cancelledAt) {
    throw new Error('status "cancelled" requires cancelledAt.');
  }
});

DocumentRequestSchema.index({ case: 1, status: 1, dueDate: 1 });
DocumentRequestSchema.index({ workspace: 1, status: 1, dueDate: 1 });
DocumentRequestSchema.index({ requestedFrom: 1, status: 1, dueDate: 1 });
DocumentRequestSchema.index({ category: 1, status: 1 });
DocumentRequestSchema.index({ fulfilledByDocument: 1 });

module.exports = mongoose.model('DocumentRequest', DocumentRequestSchema, 'document_requests');
