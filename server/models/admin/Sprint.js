const mongoose = require('mongoose');

const SprintSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    goal: { type: String, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['planning', 'active', 'completed'], default: 'planning' },
    createdBy: { type: String, default: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sprint', SprintSchema);
