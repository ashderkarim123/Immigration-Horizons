import "server-only";

import mongoose, { Schema } from "mongoose";

const HISTORY_EVENT_TYPES = [
  "created",
  "acknowledged",
  "assigned",
  "scheduled",
  "rescheduled",
  "status_changed",
  "answered",
  "clarification_requested",
  "client_follow_up",
  "resolution_confirmed",
  "resolution_reopened",
  "cancelled",
  "no_show",
  "closed",
] as const;

/** Mirrors server/models/InteractionHistory.js — append-only, written only by the service layer. */
const InteractionHistorySchema = new Schema(
  {
    interaction: { type: Schema.Types.ObjectId, ref: "ConsultationInteraction", required: true },
    eventType: { type: String, enum: HISTORY_EVENT_TYPES, required: true },

    previousStatus: { type: String, default: "" },
    newStatus: { type: String, default: "" },
    previousScheduledFor: { type: Date, default: null },
    newScheduledFor: { type: Date, default: null },
    previousTimezone: { type: String, default: "" },
    newTimezone: { type: String, default: "" },
    previousAssignee: { type: Schema.Types.ObjectId, default: null },
    newAssignee: { type: Schema.Types.ObjectId, default: null },

    actorType: { type: String, enum: ["client", "admin_user", "env_fallback", "system"], default: "system" },
    actorClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    actorAdmin: { type: Schema.Types.ObjectId, default: null },
    actorName: { type: String, default: "System" },

    reason: { type: String, default: "", maxlength: 1000 },
    clientVisibleSummary: { type: String, default: "", maxlength: 300 },
    internalMetadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

InteractionHistorySchema.index({ interaction: 1, createdAt: 1 });

export const InteractionHistory =
  mongoose.models.InteractionHistory ||
  mongoose.model("InteractionHistory", InteractionHistorySchema, "interaction_history");
