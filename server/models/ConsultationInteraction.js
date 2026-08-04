const mongoose = require('mongoose');
const {
  SCOPE_TYPES,
  INTERACTION_TYPES,
  INTERACTION_STATUSES,
  INTERACTION_PRIORITIES,
  CLIENT_RESOLUTION_STATUSES,
} = require('../utils/interactionConstants');

/**
 * A trackable client question or scheduled-consultation request — the
 * operational lifecycle between a Consultation/ClientCase and an eventual
 * answer. See docs/architecture/ADR-003-consultation-interactions.md.
 *
 * Dual-writer: both this app and the Next.js app create/mutate documents
 * of this model, each only ever setting the fields it owns (ADR-003 §1).
 * Optimistic concurrency is Mongoose's built-in `__v` — every mutation
 * path loads-then-.save()s, never a blind findOneAndUpdate (ADR-003 §2).
 */
const ConsultationInteractionSchema = new mongoose.Schema(
  {
    interactionNumber: { type: String, required: true, trim: true },
    scopeType: { type: String, enum: SCOPE_TYPES, required: true },

    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', required: true },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', default: null },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', default: null },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', default: null },

    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: INTERACTION_TYPES, required: true },
    status: { type: String, enum: INTERACTION_STATUSES, default: 'submitted' },
    // Server-controlled only — clients never set this directly (ADR-003 §11).
    priority: { type: String, enum: INTERACTION_PRIORITIES, default: 'normal' },

    scheduledFor: { type: Date, default: null },
    timezone: { type: String, default: '' },
    responseDueAt: { type: Date, default: null },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },

    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    answeredAt: { type: Date, default: null },
    resolutionSummary: { type: String, default: '', maxlength: 2000 },
    clientVisibleResponse: { type: String, default: '', maxlength: 5000 },
    // Never returned through any client-facing path — see services/interactionSerializers.js.
    internalResponse: { type: String, default: '', maxlength: 5000 },

    clientResolutionStatus: { type: String, enum: CLIENT_RESOLUTION_STATUSES, default: 'unresolved' },
    clientResolvedAt: { type: Date, default: null },
    clientResolutionNote: { type: String, default: '', maxlength: 2000 },

    cancelledAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    createdByType: { type: String, enum: ['client', 'admin', 'system'], required: true },
    createdByClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  {
    timestamps: true,
    // Mongoose's default __v does NOT protect a plain .save() against a
    // lost concurrent update — it only guards array-subdocument
    // modifications unless this option is set (verified empirically: a
    // bare schema let a second .save() silently overwrite a first one with
    // no error). optimisticConcurrency: true is what actually makes every
    // .save() include __v in its update filter, which is what ADR-003 §2
    // depends on for the VersionError-based conflict detection.
    optimisticConcurrency: true,
  },
);

/**
 * Scope consistency and status-specific field requirements — enforced at
 * the model layer so a route bug can't silently persist an invalid
 * combination (same principle as WorkspaceMember's polymorphic-identity
 * hook in Cycle 2).
 */
ConsultationInteractionSchema.pre('validate', function () {
  if (this.scopeType === 'consultation') {
    if (!this.consultation) throw new Error('scopeType "consultation" requires consultation.');
    if (this.case || this.workspace) {
      throw new Error('scopeType "consultation" must not set case/workspace.');
    }
  } else if (this.scopeType === 'case') {
    if (!this.case || !this.workspace) {
      throw new Error('scopeType "case" requires both case and workspace.');
    }
  }

  if ((this.status === 'scheduled' || this.status === 'rescheduled') && (!this.scheduledFor || !this.timezone)) {
    throw new Error(`status "${this.status}" requires scheduledFor and timezone.`);
  }
  if (this.status === 'answered' && (!this.answeredAt || !this.answeredBy)) {
    throw new Error('status "answered" requires answeredAt and answeredBy.');
  }
  if (this.status === 'cancelled' && !this.cancelledAt) {
    throw new Error('status "cancelled" requires cancelledAt.');
  }
  if (this.status === 'closed' && !this.closedAt) {
    throw new Error('status "closed" requires closedAt.');
  }
  if (this.status === 'no_show' && !this.scheduledFor) {
    throw new Error('status "no_show" requires a previously scheduled interaction.');
  }
});

ConsultationInteractionSchema.index({ interactionNumber: 1 }, { unique: true });
// At most one initial_consultation interaction per Consultation.
ConsultationInteractionSchema.index(
  { consultation: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'initial_consultation', consultation: { $type: 'objectId' } },
  },
);
ConsultationInteractionSchema.index({ case: 1, createdAt: -1 });
ConsultationInteractionSchema.index({ workspace: 1, createdAt: -1 });
ConsultationInteractionSchema.index({ clientUser: 1, createdAt: -1 });
ConsultationInteractionSchema.index({ assignedTo: 1, status: 1, scheduledFor: 1 });
ConsultationInteractionSchema.index({ status: 1, responseDueAt: 1 });
ConsultationInteractionSchema.index({ status: 1, scheduledFor: 1 });
ConsultationInteractionSchema.index({ status: 1, answeredAt: -1 });
ConsultationInteractionSchema.index({ type: 1, status: 1, createdAt: -1 });
ConsultationInteractionSchema.index({ scopeType: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model(
  'ConsultationInteraction',
  ConsultationInteractionSchema,
  'consultation_interactions',
);
