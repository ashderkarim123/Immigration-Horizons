const mongoose = require('mongoose');

/**
 * Append-only, case-scoped audit log — kept separate from ActivityLog
 * (lead-scoped, closed enum of lead-specific event types like
 * "status_changed"/"file_uploaded") rather than widening that model's
 * meaning. See docs/architecture/ADR-002-case-workspace-domain.md and
 * 03_CLIENT_CASES_AND_WORKSPACES.md §15: "Do not force case events into
 * free-text lead logs when doing so prevents proper case history."
 *
 * The originating lead's ActivityLog still receives one 'case_converted'
 * entry linking to the case (see services/caseConversion.js) — this model
 * covers everything that happens to the case *after* that point.
 */
const ACTIVITY_TYPES = [
  'case_created',
  'workspace_created',
  'client_membership_created',
  'employee_membership_created',
  'member_reactivated',
  'member_removed',
  'project_manager_changed',
  'stage_changed',
  'case_archived',
  // Cycle 5 — document management (ADR-004 §16). Downloads are
  // deliberately NOT here — see DocumentAccessLog.js.
  'category_provisioned',
  'category_created',
  'category_renamed',
  'category_reordered',
  'category_disabled',
  'category_reactivated',
  'document_requested',
  'document_request_updated',
  'document_request_cancelled',
  'document_uploaded',
  'document_reviewed',
  'document_replacement_uploaded',
  'document_category_changed',
  'document_version_created',
  'document_archived',
  // Cycle 6 — team collaboration (ADR-005 §30). Message create/edit/reply
  // are intentionally NOT here — module doc §30: "avoid flooding
  // CaseActivity with every read event," and per-message events are
  // covered by MessageRevision (edits/deletions) and the messages
  // themselves (creation) rather than duplicated into the case timeline.
  'channel_provisioned',
  'channel_created',
  'channel_renamed',
  'channel_visibility_changed',
  'channel_archived',
  'channel_reordered',
  'channel_member_added',
  'channel_member_removed',
  // Cycle 8 — a deliberately published, client-visible case update
  // (ADR-007 §6). Distinct from the automatic system messages above.
  'client_update_published',
];

const CaseActivitySchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCase', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', default: null },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    message: { type: String, required: true },

    // Actor snapshot, not just a reference — must remain meaningful for the
    // env-credential fallback admin, which has no persistent AdminUser id.
    actorType: { type: String, enum: ['admin_user', 'env_fallback', 'system'], default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    actorName: { type: String, default: 'System' },

    targetMember: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMember', default: null },

    // Structured previous/new values for changes (stage, project manager,
    // etc.) — never secrets or invitation tokens.
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

CaseActivitySchema.statics.TYPES = ACTIVITY_TYPES;

CaseActivitySchema.statics.record = function record({
  caseId,
  workspaceId,
  type,
  message,
  actor,
  targetMember,
  meta,
}) {
  return this.create({
    case: caseId,
    workspace: workspaceId || null,
    type,
    message,
    actorType: actor?.type || 'system',
    actorId: actor?.id || null,
    actorName: actor?.name || 'System',
    targetMember: targetMember || null,
    meta: meta || null,
  });
};

CaseActivitySchema.index({ case: 1, createdAt: -1 });
CaseActivitySchema.index({ workspace: 1, createdAt: -1 });

module.exports = mongoose.model('CaseActivity', CaseActivitySchema, 'case_activities');
