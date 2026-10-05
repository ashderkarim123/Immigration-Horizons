const mongoose = require('mongoose');
const { STATUS_CATEGORIES, STATUS_SOURCES, LIMITS } = require('../utils/uscisConstants');

const { ObjectId } = mongoose.Schema.Types;

/**
 * One immutable USCIS status observation (ADR-026). A correction is a new
 * event, never an edit: the model refuses updates, replacements and deletes,
 * and there is no API route that could attempt one. A provider-sourced event
 * carries a deterministic `providerEventKey`, so replaying the same
 * observation can never create a second row.
 */
const USCISStatusEventSchema = new mongoose.Schema(
  {
    filing: { type: ObjectId, ref: 'USCISFiling', required: true },
    case: { type: ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: ObjectId, ref: 'CaseWorkspace', required: true },

    statusCategory: { type: String, enum: STATUS_CATEGORIES, required: true },
    statusTitle: { type: String, required: true, trim: true, maxlength: LIMITS.statusTitle },
    statusDescription: { type: String, default: '', maxlength: LIMITS.statusDescription },

    occurredAt: { type: Date, required: true },
    observedAt: { type: Date, required: true },

    source: { type: String, enum: STATUS_SOURCES, required: true },

    providerEventKey: { type: String, default: null },
    providerModifiedAt: { type: Date, default: null },
    providerPayloadHash: { type: String, default: null },

    actionRequired: { type: Boolean, default: false },
    responseDueAt: { type: Date, default: null },

    clientVisible: { type: Boolean, default: false },

    createdBy: { type: ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

USCISStatusEventSchema.index({ filing: 1, occurredAt: -1, createdAt: -1 });
USCISStatusEventSchema.index({ case: 1, createdAt: -1 });
USCISStatusEventSchema.index({ providerEventKey: 1 }, { unique: true, partialFilterExpression: { providerEventKey: { $type: 'string' } } });

const refuse = () => {
  throw new Error('USCISStatusEvent is append-only.');
};
// Query middleware covers Model.updateOne(...) etc.; document middleware covers doc.updateOne()/doc.deleteOne().
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  USCISStatusEventSchema.pre(op, refuse),
);
['updateOne', 'deleteOne'].forEach((op) => USCISStatusEventSchema.pre(op, { document: true, query: false }, refuse));
USCISStatusEventSchema.pre('save', function appendOnly() {
  if (!this.isNew) refuse();
});
// ponytail: insertMany/bulkWrite bypass middleware like every append-only model here; nothing in the app calls them on this collection.

module.exports = mongoose.model('USCISStatusEvent', USCISStatusEventSchema, 'uscis_status_events');
