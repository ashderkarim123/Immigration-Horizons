const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    url: { type: String, required: true },
    altText: { type: String, default: '' },
    folder: { type: String, default: '/' },
    uploadedBy: { type: String, default: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', MediaSchema);
