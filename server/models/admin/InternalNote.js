const mongoose = require('mongoose');

const InternalNoteSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
      index: true,
    },
    author: { type: String, default: 'Admin' },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    content: { type: String, required: true },

    noteType: {
      type: String,
      enum: ['general', 'status_change', 'task', 'client_communication'],
      default: 'general',
    },
    visibility: { type: String, enum: ['internal', 'client'], default: 'internal' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InternalNote', InternalNoteSchema);
