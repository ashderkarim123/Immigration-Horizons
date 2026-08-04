import "server-only";

import mongoose from "mongoose";

import { getDb } from "../db";
import { ClientCase } from "../models/ClientCase";
import { CaseWorkspace } from "../models/CaseWorkspace";
import { WorkspaceMember } from "../models/WorkspaceMember";
import { WorkspaceChannel } from "../models/WorkspaceChannel";
import { ChannelMember } from "../models/ChannelMember";
import { WorkspaceMessage } from "../models/WorkspaceMessage";
import { CLIENT_ACCESSIBLE_VISIBILITY } from "../content/collaboration-constants";

/**
 * Row-level collaboration access for the client portal — same two-layer
 * shape as the server's collaborationPolicy.js (ADR-005 §5/§6): active
 * WorkspaceMember is required for every channel; an active ChannelMember
 * is *additionally* required only for `restricted_members` channels. A
 * different client's channel/message, a `employees_only` channel, and a
 * nonexistent one all return the identical `null`.
 */

async function activeMembership(workspaceId: string, clientUserId: string) {
  return WorkspaceMember.findOne({
    workspace: workspaceId,
    clientUser: clientUserId,
    memberType: "client",
    status: "active",
  }).lean();
}

async function hasRestrictedChannelAccess(channelId: string, workspaceMemberId: string) {
  const channelMember = await ChannelMember.findOne({
    channel: channelId,
    workspaceMember: workspaceMemberId,
    status: "active",
  }).lean();
  return !!channelMember;
}

export async function getAccessibleMessageCenter(caseId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(caseId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const caseDoc = await ClientCase.findById(caseId).lean();
  if (!caseDoc) return null;

  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: "primary" }).lean();
  if (!workspace) return null;

  const membership = await activeMembership(String(workspace._id), clientUserId);
  if (!membership) return null;

  const clientVisibleChannels = await WorkspaceChannel.find({
    workspace: workspace._id,
    archivedAt: null,
    visibility: { $in: CLIENT_ACCESSIBLE_VISIBILITY },
  })
    .sort({ order: 1 })
    .lean();

  const restrictedChannels = await WorkspaceChannel.find({
    workspace: workspace._id,
    archivedAt: null,
    visibility: "restricted_members",
  })
    .sort({ order: 1 })
    .lean();

  const accessibleRestricted = [];
  for (const channel of restrictedChannels) {
    if (await hasRestrictedChannelAccess(String(channel._id), String(membership._id))) {
      accessibleRestricted.push(channel);
    }
  }

  const channels = [...clientVisibleChannels, ...accessibleRestricted].sort((a, b) => a.order - b.order);

  return { caseDoc, workspace, membership, channels };
}

/**
 * A single channel, only when it's within the client's accessible set —
 * never inferred from visibility alone (a restricted_members channel
 * additionally requires an active ChannelMember row, checked live).
 */
export async function getAccessibleChannel(channelId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(channelId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const channel = await WorkspaceChannel.findById(channelId).lean();
  if (!channel || channel.archivedAt) return null;

  const membership = await activeMembership(String(channel.workspace), clientUserId);
  if (!membership) return null;

  if (!(CLIENT_ACCESSIBLE_VISIBILITY as readonly string[]).includes(channel.visibility as string)) {
    if (channel.visibility !== "restricted_members") return null;
    const hasAccess = await hasRestrictedChannelAccess(String(channel._id), String(membership._id));
    if (!hasAccess) return null;
  }

  return { channel, membership };
}

/** A message, only reachable through its already-accessible channel — never by id alone. */
export async function getAccessibleMessage(messageId: string, clientUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(messageId)) return null;

  const db = getDb();
  if (!db) return null;
  await db;

  const message = await WorkspaceMessage.findById(messageId).lean();
  if (!message) return null;

  const accessible = await getAccessibleChannel(String(message.channel), clientUserId);
  if (!accessible) return null;

  return { message, channel: accessible.channel, membership: accessible.membership };
}
