import "server-only";

import mongoose, { Schema } from "mongoose";

import { DOCUMENT_REQUEST_STATUSES } from "../content/document-constants";

/**
 * Mirrors server/models/DocumentRequest.js. This app is read-only against
 * DocumentRequest except for the one client-owned mutation: fulfilling a
 * request by uploading a document (handled in the upload API route, which
 * sets `status`/`fulfilledByDocument`/`fulfilledAt` — the only fields this
 * app ever writes here).
 */
const DocumentRequestSchema = new Schema(
  {
    case: { type: Schema.Types.ObjectId, ref: "ClientCase", required: true },
    workspace: { type: Schema.Types.ObjectId, ref: "CaseWorkspace", required: true },
    category: { type: Schema.Types.ObjectId, ref: "DocumentCategory", required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, default: "", trim: true, maxlength: 2000 },

    requestedFrom: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },
    requestedBy: { type: Schema.Types.ObjectId, default: null },

    dueDate: { type: Date, default: null },
    status: { type: String, enum: DOCUMENT_REQUEST_STATUSES, default: "open" },

    fulfilledByDocument: { type: Schema.Types.ObjectId, ref: "CaseDocument", default: null },
    fulfilledAt: { type: Date, default: null },

    clientVisibleComment: { type: String, default: "", maxlength: 1000 },
    // Never read through any client-facing query projection in this app.
    internalComment: { type: String, default: "", maxlength: 1000 },

    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DocumentRequestSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.status === "fulfilled" && (!this.fulfilledByDocument || !this.fulfilledAt)) {
    throw new Error('status "fulfilled" requires fulfilledByDocument and fulfilledAt.');
  }
  if (this.status === "cancelled" && !this.cancelledAt) {
    throw new Error('status "cancelled" requires cancelledAt.');
  }
});

DocumentRequestSchema.index({ case: 1, status: 1, dueDate: 1 });
DocumentRequestSchema.index({ requestedFrom: 1, status: 1, dueDate: 1 });

export const DocumentRequest =
  mongoose.models.DocumentRequest || mongoose.model("DocumentRequest", DocumentRequestSchema, "document_requests");
