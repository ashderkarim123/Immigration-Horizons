import mongoose from "mongoose";

const EVIDENCE_TEMPLATE_STATUSES = ["draft", "active", "retired"];
const REQUIREMENT_IMPORTANCE = ["required", "recommended", "optional"];

const EvidenceTemplateItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    importance: { type: String, enum: REQUIREMENT_IMPORTANCE, default: "required" },
    section: { type: String, default: "General" },
    order: { type: Number, default: 0 },
    clientGuidance: { type: String, default: "" },
    staffGuidance: { type: String, default: "" },
    suggestedCategoryKey: { type: String, default: "" },
  },
  { _id: false }
);

const EvidenceTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    caseType: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    status: {
      type: String,
      enum: EVIDENCE_TEMPLATE_STATUSES,
      default: "draft",
      index: true,
    },
    items: [EvidenceTemplateItemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser" },
    publishedAt: { type: Date, default: null },
    retiredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

EvidenceTemplateSchema.index({ key: 1, version: 1 }, { unique: true });
EvidenceTemplateSchema.index({ caseType: 1, status: 1, version: -1 });

export const EvidenceTemplate =
  mongoose.models.EvidenceTemplate || mongoose.model("EvidenceTemplate", EvidenceTemplateSchema);
