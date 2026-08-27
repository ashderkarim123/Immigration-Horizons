import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Mirrors server/models/admin/Notification.js exactly, including the
 * Cycle 7 immutable-recipient-identity fields (ADR-006 §1). Uses the SAME
 * implicit Mongoose pluralization ("notifications") the server's own model
 * already relies on — not an explicit collection name (Cycle 6 precedent).
 */
export const NOTIFICATION_TYPES = [
  "new_lead",
  "lead_assigned",
  "task_assigned",
  "task_completed",
  "task_overdue",
  "lead_waiting_on_client",
  "lead_in_review",
  "lead_package_ready",
  "lead_submitted",
  "lead_delivered",
  "note_added",
  "client_response",
  "case_assigned_manager",
  "case_member_added",
  "query_assigned",
  "query_client_follow_up",
  "query_needs_more_help",
  "document_uploaded",
  "document_replacement_uploaded",
  "document_request_overdue",
  "message_mention",
  "message_reply",
  "query_scheduled",
  "query_answered",
  "query_clarification_requested",
  "query_cancelled",
  "document_requested",
  "document_request_updated",
  "document_request_cancelled",
  "document_accepted",
  "document_replacement_requested",
] as const;

export const RECIPIENT_TYPES = ["employee", "client"] as const;
export const EMAIL_STATES = ["not_applicable", "pending", "sent", "skipped_no_key", "skipped_preference", "failed"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationRecipientType = (typeof RECIPIENT_TYPES)[number];

const NotificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, default: null },
    recipientName: { type: String, default: "" },

    recipientType: { type: String, enum: RECIPIENT_TYPES, default: null },
    recipientAdmin: { type: Schema.Types.ObjectId, default: null },
    recipientClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },

    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },

    relatedLead: { type: Schema.Types.ObjectId, ref: "Consultation", default: null },
    relatedTask: { type: Schema.Types.ObjectId, default: null },
    relatedCase: { type: Schema.Types.ObjectId, ref: "ClientCase", default: null },
    relatedInteraction: { type: Schema.Types.ObjectId, ref: "ConsultationInteraction", default: null },
    relatedDocument: { type: Schema.Types.ObjectId, ref: "CaseDocument", default: null },
    relatedDocumentRequest: { type: Schema.Types.ObjectId, ref: "DocumentRequest", default: null },
    relatedChannel: { type: Schema.Types.ObjectId, ref: "WorkspaceChannel", default: null },
    relatedMessage: { type: Schema.Types.ObjectId, ref: "WorkspaceMessage", default: null },

    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },

    emailState: { type: String, enum: EMAIL_STATES, default: "not_applicable" },
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true },
);

NotificationSchema.index({ recipientName: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipientType: 1, recipientAdmin: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipientType: 1, recipientClient: 1, read: 1, createdAt: -1 });
NotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

export const Notification = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
