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
  // Cycle 7 — client-facing (ADR-006 §6). Each parallels an email that
  // already existed from an earlier cycle; see the ADR table for the
  // exact trigger point.
  'query_scheduled',
  'query_answered',
  'query_clarification_requested',
  'query_cancelled',
  'document_requested',
  'document_request_updated',
  'document_request_cancelled',
  'document_accepted',
  'document_replacement_requested',
];

const RECIPIENT_TYPES = ['employee', 'client'];
const EMAIL_STATES = ['not_applicable', 'pending', 'sent', 'skipped_no_key', 'skipped_preference', 'failed'];

const NotificationSchema = new mongoose.Schema(
  {
    // Legacy display-name targeting (pre-Cycle-7) — kept exactly as-is so
    // the admin topbar bell's existing hot query keeps working unmodified.
    // See ADR-006 §1: every notification created from this cycle forward
    // populates BOTH the legacy fields below and the identity fields that
    // follow; rows from before this cycle simply have no identity fields.
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    recipientName: { type: String, default: '' },

    // Cycle 7 — immutable recipient identity (ADR-006 §1).
    recipientType: { type: String, enum: RECIPIENT_TYPES, default: null },
    recipientAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    recipientClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },

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
    readAt: { type: Date, default: null },

    // Cycle 7 — email side-effect tracking (ADR-006 §5). Observability,
    // not a gate: a notification is durable and visible in-app regardless
    // of what happened to its email.
    emailState: { type: String, enum: EMAIL_STATES, default: 'not_applicable' },

    // Cycle 7 — idempotent-creation guard for the handful of trigger
    // points where a genuine double-fire is realistic (ADR-006 §4). Left
    // unset (not an empty string) everywhere else, matched by the sparse
    // partial index below.
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true }
);

NotificationSchema.statics.TYPES = NOTIFICATION_TYPES;
NotificationSchema.statics.RECIPIENT_TYPES = RECIPIENT_TYPES;
NotificationSchema.statics.EMAIL_STATES = EMAIL_STATES;

/**
 * Every admin page load runs `countDocuments({ recipientName, read: false })`
 * and `find({ recipientName }).sort({ createdAt: -1 }).limit(8)` for the
 * topbar notification bell (see the shared admin middleware in
 * routes/admin/index.js) — this is the hottest query in the whole app.
 * `/admin/notifications` additionally filters by `read` and sorts the same
 * way. A single compound index serves all of these: `recipientName` is
 * always the equality prefix, `read` is either filtered on or safely
 * skipped over, and `createdAt` satisfies the sort. Kept exactly as-is —
 * this index still serves every admin-side read unchanged.
 */
NotificationSchema.index({ recipientName: 1, read: 1, createdAt: -1 });

/**
 * Cycle 7 — the identity-based equivalent of the index above, serving the
 * portal's new notification list/bell and every migrated admin call site
 * going forward. `recipientType` is the equality prefix (cheap, always
 * present once set) rather than a compound on both `recipientAdmin` and
 * `recipientClient` (only one of which is ever non-null per document).
 */
NotificationSchema.index({ recipientType: 1, recipientAdmin: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipientType: 1, recipientClient: 1, read: 1, createdAt: -1 });

/** Sparse — most notifications never set dedupeKey (ADR-006 §4). */
NotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

module.exports = mongoose.model('Notification', NotificationSchema);
