const mongoose = require('mongoose');

/**
 * Append-only download-access log — kept separate from `CaseActivity`
 * rather than widening that model's meaning, for the same reason
 * `CaseActivity` was itself split out of the lead-scoped `ActivityLog`
 * (see CaseActivity.js's own comment): downloads are high-volume and
 * mechanical, `CaseActivity` events are rare and human-meaningful for a
 * case timeline. See docs/architecture/ADR-004-secure-document-storage.md
 * §16. Never records file content, passwords, tokens, or filesystem paths.
 */
const DocumentAccessLogSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseDocument', required: true },
    version: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVersion', default: null },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },

    actorType: { type: String, enum: ['client', 'admin_user', 'env_fallback', 'system'], required: true },
    actorClient: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientUser', default: null },
    actorAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    actorName: { type: String, default: '' },

    result: { type: String, enum: ['success', 'denied', 'not_found'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

DocumentAccessLogSchema.statics.record = function record({ documentId, versionId, caseId, actor, result }) {
  return this.create({
    document: documentId,
    version: versionId || null,
    case: caseId,
    actorType: actor?.type || 'system',
    actorClient: actor?.type === 'client' ? actor.id : null,
    actorAdmin: actor?.type === 'admin_user' ? actor.id : null,
    actorName: actor?.name || '',
    result,
  });
};

DocumentAccessLogSchema.index({ document: 1, createdAt: -1 });
DocumentAccessLogSchema.index({ case: 1, createdAt: -1 });
DocumentAccessLogSchema.index({ actorAdmin: 1, createdAt: -1 });
DocumentAccessLogSchema.index({ actorClient: 1, createdAt: -1 });

module.exports = mongoose.model('DocumentAccessLog', DocumentAccessLogSchema, 'document_access_logs');
