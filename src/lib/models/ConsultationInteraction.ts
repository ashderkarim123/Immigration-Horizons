import "server-only";

import mongoose, { Schema } from "mongoose";

import {
  SCOPE_TYPES,
  INTERACTION_TYPES,
  INTERACTION_STATUSES,
  INTERACTION_PRIORITIES,
  CLIENT_RESOLUTION_STATUSES,
} from "../content/interaction-constants";

/**
 * Mirrors server/models/ConsultationInteraction.js — dual-writer (both
 * apps create/mutate documents of this model, each only ever setting the
 * fields it owns; see docs/architecture/ADR-003-consultation-interactions.md
 * §1). Same validation invariants enforced in both schemas' pre('validate')
 * hooks, so an invalid document can never be persisted regardless of which
 * app wrote it.
 */
const ConsultationInteractionSchema = new Schema(
  {
    interactionNumber: { type: String, required: true, trim: true },
    scopeType: { type: String, enum: SCOPE_TYPES, required: true },

    clientUser: { type: Schema.Types.ObjectId, ref: "ClientUser", required: true },
    consultation: { type: Schema.Types.ObjectId, ref: "Consultation", default: null },
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", default: null },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", default: null },

    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: INTERACTION_TYPES, required: true },
    status: { type: String, enum: INTERACTION_STATUSES, default: "submitted" },
    priority: { type: String, enum: INTERACTION_PRIORITIES, default: "normal" },

    scheduledFor: { type: Date, default: null },
    timezone: { type: String, default: "" },
    responseDueAt: { type: Date, default: null },

    assignedTo: { type: Schema.Types.ObjectId, default: null },

    answeredBy: { type: Schema.Types.ObjectId, default: null },
    answeredAt: { type: Date, default: null },
    resolutionSummary: { type: String, default: "", maxlength: 2000 },
    clientVisibleResponse: { type: String, default: "", maxlength: 5000 },
    // Never read through any client-facing query projection in this app.
    internalResponse: { type: String, default: "", maxlength: 5000 },

    clientResolutionStatus: { type: String, enum: CLIENT_RESOLUTION_STATUSES, default: "unresolved" },
    clientResolvedAt: { type: Date, default: null },
    clientResolutionNote: { type: String, default: "", maxlength: 2000 },

    cancelledAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    createdByType: { type: String, enum: ["client", "admin", "system"], required: true },
    createdByClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    createdByAdmin: { type: Schema.Types.ObjectId, default: null },
  },
  {
    timestamps: true,
    // Mongoose's default __v does NOT protect a plain .save() against a
    // lost concurrent update on its own — verified empirically; it only
    // guards array-subdocument modifications unless this option is set.
    // Must match server/models/ConsultationInteraction.js exactly, since
    // both apps write this collection (ADR-003 §2).
    optimisticConcurrency: true,
  },
);

ConsultationInteractionSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.scopeType === "consultation") {
    if (!this.consultation) throw new Error('scopeType "consultation" requires consultation.');
    if (this.case || this.workspace) {
      throw new Error('scopeType "consultation" must not set case/workspace.');
    }
  } else if (this.scopeType === "case") {
    if (!this.case || !this.workspace) {
      throw new Error('scopeType "case" requires both case and workspace.');
    }
  }

  if ((this.status === "scheduled" || this.status === "rescheduled") && (!this.scheduledFor || !this.timezone)) {
    throw new Error(`status "${this.status}" requires scheduledFor and timezone.`);
  }
  if (this.status === "answered" && (!this.answeredAt || !this.answeredBy)) {
    throw new Error('status "answered" requires answeredAt and answeredBy.');
  }
  if (this.status === "cancelled" && !this.cancelledAt) {
    throw new Error('status "cancelled" requires cancelledAt.');
  }
  if (this.status === "closed" && !this.closedAt) {
    throw new Error('status "closed" requires closedAt.');
  }
  if (this.status === "no_show" && !this.scheduledFor) {
    throw new Error('status "no_show" requires a previously scheduled interaction.');
  }
});

ConsultationInteractionSchema.index({ interactionNumber: 1 }, { unique: true });
ConsultationInteractionSchema.index(
  { consultation: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: "initial_consultation", consultation: { $type: "objectId" } } },
);
ConsultationInteractionSchema.index({ clientUser: 1, createdAt: -1 });
ConsultationInteractionSchema.index({ case: 1, createdAt: -1 });
ConsultationInteractionSchema.index({ workspace: 1, createdAt: -1 });

export const ConsultationInteraction =
  mongoose.models.ConsultationInteraction ||
  mongoose.model("ConsultationInteraction", ConsultationInteractionSchema, "consultation_interactions");
