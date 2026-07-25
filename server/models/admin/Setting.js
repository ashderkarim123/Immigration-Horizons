const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema(
  {
    group: {
      type: String,
      enum: ['general', 'social', 'analytics', 'email', 'seo_defaults', 'contact_form'],
      required: true,
      index: true,
    },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: '' },
  },
  { timestamps: true }
);

SettingSchema.index({ group: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Setting', SettingSchema);
