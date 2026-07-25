const mongoose = require('mongoose');

const TestimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    country: { type: String, default: '' },
    profession: { type: String, default: '' },
    service: { type: String, default: '' },
    review: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    photo: { type: String, default: '' },
    verificationUrl: { type: String, default: '' },
    featured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['published', 'draft', 'archived'],
      default: 'published',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Testimonial', TestimonialSchema);
