const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'new_lead',
  'lead_assigned',
  'task_assigned',
  'task_completed',
  'task_overdue',
  'lead_waiting_on_client',
  'lead_in_review',
  'lead_package_ready',
  'lead_submitted',
  'lead_delivered',
  'note_added',
  'client_response',
  // Cycle 2.
  'case_assigned_manager',
  'case_member_added',
  // Cycle 3.
  'query_assigned',
  'query_client_follow_up',
  'query_needs_more_help',
  // Cycle 5.
  'document_uploaded',
  'document_replacement_uploaded',
  'document_request_overdue',
  // Cycle 6.
  'message_mention',
  'message_reply',
];

const NotificationSchema = new mongoose.Schema(
  {
    // Targeted by name so it works whether the recipient is a DB AdminUser
    // or the env-credential fallback admin (which has no user document).
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    recipientName: { type: String, default: '' },

    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },

    relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', default: null },
    relatedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    relatedCase: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', default: null },
    relatedInteraction: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultationInteraction', default: null },
    relatedDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument', default: null },
    relatedDocumentRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentRequest', default: null },
    relatedChannel: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceChannel', default: null },
    relatedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMessage', default: null },

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.statics.TYPES = NOTIFICATION_TYPES;

/**
 * Every admin page load runs `countDocuments({ recipientName, read: false })`
 * and `find({ recipientName }).sort({ createdAt: -1 }).limit(8)` for the
 * topbar notification bell (see the shared admin middleware in
 * routes/admin/index.js) — this is the hottest query in the whole app.
 * `/admin/notifications` additionally filters by `read` and sorts the same
 * way. A single compound index serves all of these: `recipientName` is
 * always the equality prefix, `read` is either filtered on or safely
 * skipped over, and `createdAt` satisfies the sort.
 */
NotificationSchema.index({ recipientName: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
