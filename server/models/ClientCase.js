const mongoose = require('mongoose');
const { CASE_TYPE_VALUES, CASE_STAGE_VALUES } = require('../utils/caseConstants');

/**
 * An accepted immigration matter or service project — the formal layer
 * between a Consultation (a lead) and operational work (tasks, documents,
 * messages in later cycles). See docs/architecture/ADR-002-case-workspace-domain.md
 * for why this is a separate, Express-owned schema rather than shared code
 * with the Next.js app.
 */
const ClientCaseSchema = new mongoose.Schema(
  {
    caseNumber: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    caseType: { type: String, enum: CASE_TYPE_VALUES, required: true },

    // Coarse active/archived flag, mechanically derived from archivedAt —
    // never set independently of it (see the pre-save hook below). Kept as
    // its own indexed field (rather than always querying `archivedAt: null`)
    // because the module document's suggested compound indexes
    // (`primaryClient + archivedAt + createdAt`,
    // `projectManager + archivedAt + status`) name both fields explicitly.
    status: { type: String, enum: ['active', 'archived'], default: 'active' },

    // The granular pipeline position (intake -> ... -> archived). Mutated
    // only through POST /admin/cases/:id/stage, which validates the
    // destination and audits the change — see server/services/casePolicy.js.
    currentStage: { type: String, enum: CASE_STAGE_VALUES, default: 'intake' },

    consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', default: null },

    // The explicit primary external client. Additional client access is
    // represented by WorkspaceMember records, not a second array here — one
    // source of truth for "who has access," per the module document.
    primaryClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', required: true },

    // Operational convenience reference for querying "this PM's cases."
    // Authorization never reads this field alone — the assigned PM must
    // also hold an active project_manager WorkspaceMember (enforced by
    // services/caseConversion.js and services/caseManagement.js).
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },

    // Snapshot of who created the case. A real AdminUser id when available;
    // the env-credential fallback admin has no persistent id (see
    // docs/architecture/ADR-002 and utils/actorSnapshot.js), so this stays
    // nullable and createdByName carries a display label either way.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdByName: { type: String, default: '' },

    openedAt: { type: Date, default: () => new Date() },
    targetFilingDate: { type: Date, default: null },
    filedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

ClientCaseSchema.pre('save', function () {
  // Single source of truth: `status` always mirrors whether `archivedAt` is
  // set, never settable independently through any route.
  this.status = this.archivedAt ? 'archived' : 'active';
});

// Unique case number — the final concurrency guard against the random
// generator (see utils/caseNumber.js) colliding; a duplicate-key error on
// this index is what triggers the conversion service's regenerate-and-retry
// loop, not application-level counting.
ClientCaseSchema.index({ caseNumber: 1 }, { unique: true });

// A consultation may be converted at most once. Partial (not sparse) so
// only documents where `consultation` is an actual ObjectId participate in
// the uniqueness constraint — this is the database-level guarantee behind
// "duplicate conversion is rejected safely," independent of any
// application-level "already converted" check, which is inherently
// race-prone on its own.
ClientCaseSchema.index(
  { consultation: 1 },
  { unique: true, partialFilterExpression: { consultation: { $type: 'objectId' } } },
);

ClientCaseSchema.index({ primaryClient: 1, archivedAt: 1, createdAt: -1 });
ClientCaseSchema.index({ projectManager: 1, archivedAt: 1, status: 1 });
ClientCaseSchema.index({ currentStage: 1, createdAt: -1 });
ClientCaseSchema.index({ createdAt: -1 });
// Cycle 8C: the SaaS staff case list sorts by updatedAt and the
// "needing attention"/stalled queues filter on it. Declared identically in
// src/lib/models/ClientCase.ts so the two mirrors stay in step.
ClientCaseSchema.index({ archivedAt: 1, updatedAt: -1 });

module.exports = mongoose.model('ClientCase', ClientCaseSchema, 'client_cases');
