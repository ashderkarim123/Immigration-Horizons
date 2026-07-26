const mongoose = require('mongoose');

const TASK_TYPES = [
  'Petition Writing',
  'Business Plan',
  'Recommendation Letters',
  'Expert Opinion Letters',
  'USCIS Forms',
  'Evidence Review',
  'Client Follow-Up',
  'QC Review',
  'Package Assembly',
  'Delivery',
  'Other',
];

const TASK_STATUSES = ['todo', 'in_progress', 'waiting', 'review', 'completed'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const TaskSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: TASK_TYPES, default: 'Other' },
    description: { type: String, default: '' },

    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    // Kept alongside `assignee` so a task can be shown/exported even if the
    // assigned person is later removed from the Users collection.
    assigneeName: { type: String, default: '' },

    dueDate: { type: Date, default: null },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },

    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    sprint: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', default: null },

    notes: { type: String, default: '' },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    order: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    createdBy: { type: String, default: 'Admin' },
  },
  { timestamps: true }
);

// Mongoose 7+ dropped callback-style middleware — a synchronous hook takes
// no `next` parameter and must not call one.
TaskSchema.pre('save', function () {
  if (this.isModified('status')) {
    if (this.status === 'completed' && !this.completedAt) this.completedAt = new Date();
    if (this.status !== 'completed') this.completedAt = null;
  }
});

TaskSchema.statics.TYPES = TASK_TYPES;
TaskSchema.statics.STATUSES = TASK_STATUSES;
TaskSchema.statics.PRIORITIES = TASK_PRIORITIES;

module.exports = mongoose.model('Task', TaskSchema);
