const mongoose = require('mongoose');

/**
 * Per-member read position for one channel. See
 * docs/architecture/ADR-005-team-collaboration.md §12/§13.
 * `lastReadAt` is set to `lastReadMessage`'s own `createdAt` — not "now" —
 * so unread-count queries are a single indexed range scan without a
 * second lookup. Never grants access on its own; every read of this
 * collection is preceded by a live channel-access check
 * (collaborationPolicy.js).
 */
const ChannelReadStateSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseWorkspace', required: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceChannel', required: true },
    workspaceMember: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMember', required: true },

    lastReadMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceMessage', default: null },
    lastReadAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ChannelReadStateSchema.index({ channel: 1, workspaceMember: 1 }, { unique: true });
ChannelReadStateSchema.index({ workspaceMember: 1, updatedAt: -1 });

module.exports = mongoose.model('ChannelReadState', ChannelReadStateSchema, 'channel_read_states');
