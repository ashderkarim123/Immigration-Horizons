const mongoose = require('mongoose');
const { AUDIT_EVENT_TYPES, AUDIT_ACTOR_TYPES, FORM_STATUSES } = require('../utils/smartFormConstants');

/**
 * Append-only history of a smart form (ADR-021 §18). Records WHAT kind of
 * change happened and WHICH field keys it touched — never answer values, so
 * the audit log is not a second copy of the client's PII. Refuses updates and
 * deletes at the model layer, like SecurityEvent.
 */
const SmartFormAuditSchema = new mongoose.Schema(
  {
    caseSmartForm: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseSmartForm', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    eventType: { type: String, enum: AUDIT_EVENT_TYPES, required: true },
    fromStatus: { type: String, enum: [...FORM_STATUSES, null], default: null },
    toStatus: { type: String, enum: [...FORM_STATUSES, null], default: null },
    revision: { type: Number, required: true },
    changedFieldKeys: [{ type: String }],
    actorType: { type: String, enum: AUDIT_ACTOR_TYPES, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SmartFormAuditSchema.index({ caseSmartForm: 1, createdAt: -1 });

const refuse = () => {
  throw new Error('SmartFormAudit is append-only.');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  SmartFormAuditSchema.pre(op, refuse),
);
SmartFormAuditSchema.pre('save', function appendOnly() {
  if (!this.isNew) refuse();
});

module.exports = mongoose.model('SmartFormAudit', SmartFormAuditSchema, 'smart_form_audits');
