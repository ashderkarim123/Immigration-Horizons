import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Mirrors server/models/admin/Notification.js — first write from this app
 * against this collection (Cycle 6): a client-authored message that
 * mentions or replies to an employee must be able to notify that employee
 * in-app, and only the server-side Notification model/collection exists
 * for that (ADR-005 §17). Uses the SAME implicit Mongoose pluralization
 * ("notifications") the server's own model already relies on — not an
 * explicit collection name — to stay consistent with the existing,
 * already-shipped collection rather than introducing a second naming
 * convention for one model.
 */
const NOTIFICATION_TYPES = [
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
] as const;

const NotificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, default: null },
    recipientName: { type: String, default: "" },

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
  },
  { timestamps: true },
);

export const Notification = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
