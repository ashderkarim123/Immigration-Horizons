import "server-only";

import mongoose, { Schema } from "mongoose";

import { CASE_TYPE_VALUES, CASE_STAGE_VALUES } from "../content/case-constants";

/**
 * Read-only mirror of server/models/ClientCase.js — this app never writes
 * these collections in Cycle 2 (Express is the sole writer; see
 * docs/architecture/ADR-002-case-workspace-domain.md §1). Kept in sync by
 * server/test/case-schema-contract.test.js and
 * test/case-schema-contract.test.ts.
 */
const ClientCaseSchema = new Schema(
  {
    caseNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    caseType: { type: String, enum: CASE_TYPE_VALUES, required: true },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    currentStage: { type: String, enum: CASE_STAGE_VALUES, default: "intake" },
    consultation: { type: Schema.Types.ObjectId, ref: "Consultation", default: null },
    primaryClient: { type: Schema.Types.ObjectId, ref: "ClientUser", required: true },
    projectManager: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    createdByName: { type: String, default: "" },
    openedAt: { type: Date, default: () => new Date() },
    targetFilingDate: { type: Date, default: null },
    filedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    description: { type: String, default: "" },
  },
  { timestamps: true },
);

ClientCaseSchema.index({ caseNumber: 1 }, { unique: true });
ClientCaseSchema.index(
  { consultation: 1 },
  { unique: true, partialFilterExpression: { consultation: { $type: "objectId" } } },
);
ClientCaseSchema.index({ primaryClient: 1, archivedAt: 1, createdAt: -1 });

export const ClientCase =
  mongoose.models.ClientCase ||
  mongoose.model("ClientCase", ClientCaseSchema, "client_cases");
