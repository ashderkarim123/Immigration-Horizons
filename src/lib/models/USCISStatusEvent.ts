import "server-only";

import mongoose, { Schema } from "mongoose";

import { USCIS_LIMITS, USCIS_STATUS_CATEGORIES, USCIS_STATUS_SOURCES } from "../content/uscis-constants";

/**
 * Mirrors server/models/USCISStatusEvent.js (ADR-026). Immutable history: the portal
 * only reads it, and the same append-only guard is declared so a mistaken write here
 * fails loudly instead of silently rewriting history.
 */
const USCISStatusEventSchema = new Schema(
  {
    filing: { type: Schema.Types.ObjectId, ref: "USCISFiling", required: true },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },

    statusCategory: { type: String, enum: USCIS_STATUS_CATEGORIES, required: true },
    statusTitle: { type: String, required: true, trim: true, maxlength: USCIS_LIMITS.statusTitle },
    statusDescription: { type: String, default: "", maxlength: USCIS_LIMITS.statusDescription },

    occurredAt: { type: Date, required: true },
    observedAt: { type: Date, required: true },

    source: { type: String, enum: USCIS_STATUS_SOURCES, required: true },

    providerEventKey: { type: String, default: null },
    providerModifiedAt: { type: Date, default: null },
    providerPayloadHash: { type: String, default: null },

    actionRequired: { type: Boolean, default: false },
    responseDueAt: { type: Date, default: null },

    clientVisible: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const refuse = () => {
  throw new Error("USCISStatusEvent is append-only.");
};
(["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"] as const).forEach((op) =>
  USCISStatusEventSchema.pre(op, refuse),
);
USCISStatusEventSchema.pre("save", function appendOnly() {
  if (!this.isNew) refuse();
});

export const USCISStatusEvent =
  mongoose.models.USCISStatusEvent || mongoose.model("USCISStatusEvent", USCISStatusEventSchema, "uscis_status_events");
