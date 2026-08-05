import "server-only";

import { ChannelReadState } from "../models/ChannelReadState";
import { WorkspaceMessage } from "../models/WorkspaceMessage";

/** Mirrors server/services/readStateService.js exactly — see docs/architecture/ADR-005-team-collaboration.md §12/§13. */

export async function markChannelRead(params: {
  channel: { _id: unknown; workspace: unknown };
  workspaceMemberId: string;
  lastReadMessageId?: string | null;
}) {
  const { channel, workspaceMemberId, lastReadMessageId } = params;

  let lastReadMessage: unknown = null;
  let lastReadAt: Date;

  if (lastReadMessageId) {
    const message = await WorkspaceMessage.findById(lastReadMessageId).select("channel createdAt").lean();
    if (!message || String((message as { channel: unknown }).channel) !== String(channel._id)) {
      return { outcome: "validation_error" as const, errors: { lastReadMessage: "Message not found in this channel." } };
    }
    lastReadMessage = (message as { _id: unknown })._id;
    lastReadAt = (message as { createdAt: Date }).createdAt;
  } else {
    const latest = await WorkspaceMessage.findOne({ channel: channel._id }).sort({ createdAt: -1 }).select("_id createdAt").lean();
    lastReadMessage = latest ? (latest as { _id: unknown })._id : null;
    lastReadAt = latest ? (latest as { createdAt: Date }).createdAt : new Date();
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
    { returnDocument: "after" },
  );

  if (!advanced) {
    const current = await ChannelReadState.findOne({ channel: channel._id, workspaceMember: workspaceMemberId });
    return { outcome: "unchanged" as const, readState: current };
  }

  return { outcome: "updated" as const, readState: advanced };
}

export async function getUnreadCountsForChannels(params: {
  channelIds: unknown[];
  workspaceMemberId: string;
  selfClientId?: string;
}): Promise<Record<string, number>> {
  const { channelIds, workspaceMemberId, selfClientId } = params;
  if (!channelIds.length) return {};

  const readStates = await ChannelReadState.find({
    channel: { $in: channelIds },
    workspaceMember: workspaceMemberId,
  }).lean();
  const readStateByChannel = new Map(readStates.map((rs) => [String((rs as { channel: unknown }).channel), rs]));

  const counts: Record<string, number> = {};
  await Promise.all(
    channelIds.map(async (channelId) => {
      const readState = readStateByChannel.get(String(channelId)) as { lastReadAt?: Date } | undefined;
      const filter: Record<string, unknown> = { channel: channelId, deletedAt: null };
      if (readState && readState.lastReadAt) filter.createdAt = { $gt: readState.lastReadAt };
      if (selfClientId) filter.senderClient = { $ne: selfClientId };
      counts[String(channelId)] = await WorkspaceMessage.countDocuments(filter);
    }),
  );
  return counts;
}
