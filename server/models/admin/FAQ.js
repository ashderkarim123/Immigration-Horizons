const mongoose = require('mongoose');

const FAQSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, default: 'General' },
    displayOrder: { type: Number, default: 0 },
    showOnHomepage: { type: Boolean, default: false },
    showOnServicePage: { type: String, default: '' }, // slug of service or ''
    schemaEnabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['published', 'draft'],
      default: 'published',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FAQ', FAQSchema);
