const mongoose = require('mongoose');

const DeliveryRecordSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', required: true, index: true },

    state: {
      type: String,
      enum: ['drafting', 'internal_review', 'client_review', 'ready', 'delivered'],
      default: 'drafting',
    },
    method: { type: String, enum: ['email', 'dashboard', 'both'], default: 'email' },

    // Real file generation (PDF bundle / ZIP) is not wired up yet — this is
    // a clean record of what's ready and its status, per file, so the
    // workflow is usable now and export can be completed later.
    files: [
      {
        name: { type: String, required: true },
        url: { type: String, default: '' },
        status: { type: String, enum: ['pending', 'ready', 'sent'], default: 'pending' },
      },
    ],

    confirmationNote: { type: String, default: '' },
    deliveredAt: { type: Date, default: null },
    deliveredBy: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeliveryRecord', DeliveryRecordSchema);
