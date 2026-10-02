import "server-only";

import mongoose, { Schema } from "mongoose";

import { AUDIT_EVENT_TYPES, AUDIT_ACTOR_TYPES, FORM_STATUSES } from "../content/smart-form-constants";

/**
 * Mirrors server/models/SmartFormAudit.js (ADR-021 §18): append-only, records
 * which field KEYS changed and never the answers themselves, so the audit log
 * is not a second copy of the client's PII.
 */
const SmartFormAuditSchema = new Schema(
  {
    caseSmartForm: { type: Schema.Types.ObjectId, ref: "CaseSmartForm", required: true },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    eventType: { type: String, enum: AUDIT_EVENT_TYPES, required: true },
    fromStatus: { type: String, enum: [...FORM_STATUSES, null], default: null },
    toStatus: { type: String, enum: [...FORM_STATUSES, null], default: null },
    revision: { type: Number, required: true },
    changedFieldKeys: [{ type: String }],
    actorType: { type: String, enum: AUDIT_ACTOR_TYPES, required: true },
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SmartFormAuditSchema.index({ caseSmartForm: 1, createdAt: -1 });

const refuse = () => {
  throw new Error("SmartFormAudit is append-only.");
};
(["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"] as const).forEach((op) =>
  SmartFormAuditSchema.pre(op, refuse),
);
SmartFormAuditSchema.pre("save", function appendOnly() {
  if (!this.isNew) refuse();
});

export const SmartFormAudit =
  mongoose.models.SmartFormAudit || mongoose.model("SmartFormAudit", SmartFormAuditSchema, "smart_form_audits");
