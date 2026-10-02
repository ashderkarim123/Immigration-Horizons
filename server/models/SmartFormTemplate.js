const mongoose = require('mongoose');
const { TEMPLATE_STATUSES, TEMPLATE_AUDIENCES } = require('../utils/smartFormConstants');

/**
 * A code-owned, versioned form definition (ADR-021 §4). Published versions are
 * immutable: a change is a NEW version, and CaseSmartForm instances keep the
 * version they were provisioned from. `sections` is a plain data tree validated
 * by services/smartForms/engine.js (validateTemplateDefinition) — no executable
 * content is ever stored. `contentHash` lets the seeder detect, and refuse, a
 * code change to an already-published (key, version).
 */
const SmartFormTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    caseTypes: [{ type: String }],
    audience: { type: String, enum: TEMPLATE_AUDIENCES, default: 'client_and_staff' },
    schemaVersion: { type: Number, default: 1 },
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, enum: TEMPLATE_STATUSES, default: 'draft' },
    contentHash: { type: String, default: '' },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

SmartFormTemplateSchema.index({ key: 1, version: 1 }, { unique: true });
SmartFormTemplateSchema.index({ status: 1, caseTypes: 1 });

/**
 * Published means frozen. A save that touches content on a document that was
 * already published when loaded is refused; the status itself may still move
 * (published -> retired). Bulk updates (updateOne etc.) are not intercepted —
 * the seeder is the only writer and it is insert-only.
 */
SmartFormTemplateSchema.pre('save', function immutablePublished() {
  if (this.isNew || this.status !== 'published') return;
  const frozen = ['key', 'version', 'title', 'description', 'caseTypes', 'audience', 'schemaVersion', 'sections', 'contentHash', 'publishedAt'];
  if (frozen.some((path) => this.isModified(path))) {
    throw new Error('A published SmartFormTemplate is immutable — create a new version instead.');
  }
});

module.exports = mongoose.model('SmartFormTemplate', SmartFormTemplateSchema, 'smart_form_templates');
