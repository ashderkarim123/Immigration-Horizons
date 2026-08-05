const ChannelReadState = require('../models/ChannelReadState');
const WorkspaceMessage = require('../models/WorkspaceMessage');

/**
 * Marks a channel read through a specific message (or the latest message,
 * if none given), and computes unread counts. See
 * docs/architecture/ADR-005-team-collaboration.md §12/§13.
 *
 * Two-step upsert-then-conditionally-advance so the monotonic guarantee
 * (module doc §20 point 6: "read position must never move backward
 * accidentally") holds atomically even under concurrent requests — a
 * single findOneAndUpdate with an upsert cannot express "only advance,
 * never regress" without risking a duplicate-key race on the unique
 * (channel, workspaceMember) index.
 */
async function markChannelRead({ channel, workspaceMemberId, lastReadMessageId }) {
  let lastReadMessage = null;
  let lastReadAt;

  if (lastReadMessageId) {
    const message = await WorkspaceMessage.findById(lastReadMessageId).select('channel createdAt').lean();
    if (!message || String(message.channel) !== String(channel._id)) {
      return { outcome: 'validation_error', errors: { lastReadMessage: 'Message not found in this channel.' } };
    }
    lastReadMessage = message._id;
    lastReadAt = message.createdAt;
  } else {
    const latest = await WorkspaceMessage.findOne({ channel: channel._id }).sort({ createdAt: -1 }).select('_id createdAt').lean();
    lastReadMessage = latest ? latest._id : null;
    lastReadAt = latest ? latest.createdAt : new Date();
  }

  await ChannelReadState.updateOne(
    { channel: channel._id, workspaceMember: workspaceMemberId },
    {
      $setOnInsert: {
        workspace: channel.workspace,
        channel: channel._id,
        workspaceMember: workspaceMemberId,
        lastReadMessage: null,
        lastReadAt: null,
      },
    },
    { upsert: true },
  );

  const advanced = await ChannelReadState.findOneAndUpdate(
    {
      channel: channel._id,
      workspaceMember: workspaceMemberId,
      $or: [{ lastReadAt: null }, { lastReadAt: { $lt: lastReadAt } }],
    },
    { $set: { lastReadMessage, lastReadAt } },
    { returnDocument: 'after' },
  );

  if (!advanced) {
    const current = await ChannelReadState.findOne({ channel: channel._id, workspaceMember: workspaceMemberId });
    return { outcome: 'unchanged', readState: current };
  }

  return { outcome: 'updated', readState: advanced };
}

function selfExclusionFilter({ selfClientId, selfAdminId }) {
  const clauses = [];
  if (selfClientId) clauses.push({ senderClient: selfClientId });
  if (selfAdminId) clauses.push({ senderAdmin: selfAdminId });
  return clauses;
}

/** Own messages excluded by default — sending a message should not make the channel look unread to yourself (ADR-005 §13). */
async function getUnreadCount({ channel, workspaceMemberId, selfClientId, selfAdminId }) {
  const readState = await ChannelReadState.findOne({ channel: channel._id, workspaceMember: workspaceMemberId }).lean();
  const filter = { channel: channel._id, deletedAt: null };
  if (readState && readState.lastReadAt) filter.createdAt = { $gt: readState.lastReadAt };

  const nor = selfExclusionFilter({ selfClientId, selfAdminId });
  if (nor.length) filter.$nor = nor;

  return WorkspaceMessage.countDocuments(filter);
}

/** Bulk variant for a channel-list page — one query per channel, bounded by the (already-filtered) channel list length. */
async function getUnreadCountsForChannels({ channelIds, workspaceMemberId, selfClientId, selfAdminId }) {
  if (!channelIds.length) return {};
  const readStates = await ChannelReadState.find({
    channel: { $in: channelIds },
    workspaceMember: workspaceMemberId,
  }).lean();
  const readStateByChannel = new Map(readStates.map((rs) => [String(rs.channel), rs]));
  const nor = selfExclusionFilter({ selfClientId, selfAdminId });

  const counts = {};
  await Promise.all(
    channelIds.map(async (channelId) => {
      const readState = readStateByChannel.get(String(channelId));
      const filter = { channel: channelId, deletedAt: null };
      if (readState && readState.lastReadAt) filter.createdAt = { $gt: readState.lastReadAt };
      if (nor.length) filter.$nor = nor;
      counts[String(channelId)] = await WorkspaceMessage.countDocuments(filter);
    }),
  );
  return counts;
}

module.exports = { markChannelRead, getUnreadCount, getUnreadCountsForChannels };
