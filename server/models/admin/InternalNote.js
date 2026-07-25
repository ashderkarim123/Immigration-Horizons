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
    content: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InternalNote', InternalNoteSchema);
