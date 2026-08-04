const mongoose = require('mongoose');
const { CHANNEL_MEMBER_STATUSES } = require('../utils/collaborationConstants');

/**
 * Restricted-channel membership — only meaningful for
 * `visibility: 'restricted_members'` channels (ADR-005 §5). References
 * `WorkspaceMember`, never a bare ClientUser/AdminUser id, so restricted
 * access always implies active workspace membership too — a channel
 * member whose underlying WorkspaceMember is removed loses access
 * immediately even though this record itself stays 'active' (checked live
 * by collaborationPolicy.js on every request, never cached).
 */
const ChannelMemberSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceChannel', required: true },
    workspaceMember: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMember', required: true },

    status: { type: String, enum: CHANNEL_MEMBER_STATUSES, default: 'active' },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    addedByType: { type: String, enum: ['admin_user', 'env_fallback', 'system'], default: 'system' },

    joinedAt: { type: Date, default: Date.now },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ChannelMemberSchema.pre('validate', function () {
  if (this.status === 'removed' && !this.removedAt) {
    throw new Error('status "removed" requires removedAt.');
  }
});

// Prevents duplicates and is the reactivation lookup key — adding the same
// member back finds this same document rather than creating an ambiguous
// second row (same pattern as WorkspaceMember's own unique index, ADR-002).
ChannelMemberSchema.index({ channel: 1, workspaceMember: 1 }, { unique: true });
ChannelMemberSchema.index({ workspaceMember: 1, status: 1 });
ChannelMemberSchema.index({ channel: 1, status: 1 });

module.exports = mongoose.model('ChannelMember', ChannelMemberSchema, 'channel_members');
