const mongoose = require('mongoose');

const ConsultationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    service: {
      type: String,
      enum: [
        'EB-2 NIW', 'EB-1A', 'EB-1B', 'EB-1C', 'O-1 Visa',
        'RFE & NOID Responses', 'Recommendation Letters', 'Expert Opinion Letters',
        'Business & Personal Plans', 'Evidence Review & Packaging',
        'Immigration Consultation', 'Not Sure / Need Guidance',
      ],
      default: 'Not Sure / Need Guidance',
    },
    message: { type: String, required: true },
    // Added for the CMS leads view. Optional and back-compatible; existing
    // records simply have empty values until the forms start capturing them.
    country: { type: String, default: '', trim: true },
    occupation: { type: String, default: '', trim: true },
    attachmentUrl: { type: String, default: '' },
    source: { type: String, enum: ['consultation', 'contact'], default: 'consultation' },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmTerm: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    gclid: { type: String, default: '' },
    fbclid: { type: String, default: '' },
    landingPage: { type: String, default: '' },
    referrer: { type: String, default: '' },
    emailSent: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['new', 'contacted', 'consultation_scheduled', 'in_progress', 'closed'],
      default: 'new',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Consultation', ConsultationSchema);