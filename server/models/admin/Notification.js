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

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.statics.TYPES = NOTIFICATION_TYPES;

module.exports = mongoose.model('Notification', NotificationSchema);
