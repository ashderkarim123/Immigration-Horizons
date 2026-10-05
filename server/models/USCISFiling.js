const mongoose = require('mongoose');
const { STATUS_CATEGORIES, STATUS_SOURCES, TRACKING_PROVIDERS, LIMITS } = require('../utils/uscisConstants');

const { ObjectId } = mongoose.Schema.Types;

/**
 * One tracked USCIS filing / receipt on one case (ADR-026). A case may own
 * many. The `current*` fields are a denormalized snapshot of the winning
 * USCISStatusEvent, written only by services/uscisTracking.js; the immutable
 * events are authoritative and the snapshot can always be rebuilt from them.
 * Never holds OAuth data or a raw provider payload.
 */
const USCISFilingSchema = new mongoose.Schema(
  {
    case: { type: ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: ObjectId, ref: 'CaseWorkspace', required: true },

    title: { type: String, required: true, trim: true, maxlength: LIMITS.title },
    formType: { type: String, required: true, trim: true, maxlength: LIMITS.formType },
    formSubType: { type: String, default: null, trim: true, maxlength: LIMITS.formSubType },

    receiptNumber: { type: String, default: null },

    filedAt: { type: Date, default: null },
    receiptDate: { type: Date, default: null },
    serviceCenter: { type: String, default: null, trim: true, maxlength: LIMITS.serviceCenter },

    trackingProvider: { type: String, enum: TRACKING_PROVIDERS, default: 'none' },
    trackingEnabled: { type: Boolean, default: false },

    currentEvent: { type: ObjectId, ref: 'USCISStatusEvent', default: null },
    currentStatusCategory: { type: String, enum: [...STATUS_CATEGORIES, null], default: null },
    currentStatusTitle: { type: String, default: '', maxlength: LIMITS.statusTitle },
    currentStatusDescription: { type: String, default: '', maxlength: LIMITS.statusDescription },
    currentStatusAt: { type: Date, default: null },
    currentStatusSource: { type: String, enum: [...STATUS_SOURCES, null], default: null },

    actionRequired: { type: Boolean, default: false },
    responseDueAt: { type: Date, default: null },

    clientVisible: { type: Boolean, default: false },

    lastCheckedAt: { type: Date, default: null },
    lastSyncSucceededAt: { type: Date, default: null },
    lastSyncErrorAt: { type: Date, default: null },
    lastSyncErrorCode: { type: String, default: null, maxlength: 60 },

    archivedAt: { type: Date, default: null },

    createdBy: { type: ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },
    updatedBy: { type: ObjectId, ref: 'AdminUser', default: null },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true },
);

// A receipt identifies exactly one filing. Partial, so draft filings without one can coexist.
USCISFilingSchema.index({ receiptNumber: 1 }, { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' } } });
USCISFilingSchema.index({ case: 1, archivedAt: 1, updatedAt: -1 });
USCISFilingSchema.index({ currentStatusCategory: 1, updatedAt: -1 });
USCISFilingSchema.index({ actionRequired: 1, responseDueAt: 1 });

module.exports = mongoose.model('USCISFiling', USCISFilingSchema, 'uscis_filings');
