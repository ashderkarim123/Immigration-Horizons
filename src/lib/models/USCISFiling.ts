import "server-only";

import mongoose, { Schema } from "mongoose";

import { USCIS_LIMITS, USCIS_STATUS_CATEGORIES, USCIS_STATUS_SOURCES, USCIS_TRACKING_PROVIDERS } from "../content/uscis-constants";

/**
 * Mirrors server/models/USCISFiling.js (ADR-026). The portal only ever READS this
 * collection, through lib/uscis/client-view.ts; Staff (Express) is the only writer, so no
 * index or write path is declared here.
 */
const USCISFilingSchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },

    title: { type: String, required: true, trim: true, maxlength: USCIS_LIMITS.title },
    formType: { type: String, required: true, trim: true, maxlength: USCIS_LIMITS.formType },
    formSubType: { type: String, default: null, trim: true, maxlength: USCIS_LIMITS.formSubType },

    receiptNumber: { type: String, default: null },

    filedAt: { type: Date, default: null },
    receiptDate: { type: Date, default: null },
    serviceCenter: { type: String, default: null, trim: true, maxlength: USCIS_LIMITS.serviceCenter },

    trackingProvider: { type: String, enum: USCIS_TRACKING_PROVIDERS, default: "none" },
    trackingEnabled: { type: Boolean, default: false },

    currentEvent: { type: Schema.Types.ObjectId, ref: "USCISStatusEvent", default: null },
    currentStatusCategory: { type: String, enum: [...USCIS_STATUS_CATEGORIES, null], default: null },
    currentStatusTitle: { type: String, default: "", maxlength: USCIS_LIMITS.statusTitle },
    currentStatusDescription: { type: String, default: "", maxlength: USCIS_LIMITS.statusDescription },
    currentStatusAt: { type: Date, default: null },
    currentStatusSource: { type: String, enum: [...USCIS_STATUS_SOURCES, null], default: null },

    actionRequired: { type: Boolean, default: false },
    responseDueAt: { type: Date, default: null },

    clientVisible: { type: Boolean, default: false },

    lastCheckedAt: { type: Date, default: null },
    lastSyncSucceededAt: { type: Date, default: null },
    lastSyncErrorAt: { type: Date, default: null },
    lastSyncErrorCode: { type: String, default: null, maxlength: 60 },

    archivedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdByName: { type: String, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true },
);

export const USCISFiling = mongoose.models.USCISFiling || mongoose.model("USCISFiling", USCISFilingSchema, "uscis_filings");
