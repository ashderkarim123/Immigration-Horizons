const slugify = require('slugify');

const WorkspaceChannel = require('../models/WorkspaceChannel');
const ChannelMember = require('../models/ChannelMember');
const WorkspaceMember = require('../models/WorkspaceMember');
const CaseActivity = require('../models/CaseActivity');
const { DEFAULT_CHANNEL_TEMPLATE, CHANNEL_TYPES, CHANNEL_VISIBILITY } = require('../utils/collaborationConstants');

/**
 * Idempotent default-channel provisioning — see
 * docs/architecture/ADR-005-team-collaboration.md §20/§21, same shape as
 * documentCategoryService.js's provisionDefaultCategories(). Only inserts
 * channels whose `templateKey` doesn't already exist for this workspace,
 * so re-running never creates duplicates and never touches a channel a
 * manager has already customized.
 */
async function provisionDefaultChannels({ caseId, workspaceId, session } = {}) {
  const existing = await WorkspaceChannel.find(
    { workspace: workspaceId },
    { templateKey: 1 },
    { session: session || undefined },
  ).lean();
  const existingKeys = new Set(existing.map((c) => c.templateKey).filter(Boolean));

  const toCreate = DEFAULT_CHANNEL_TEMPLATE.filter((t) => !existingKeys.has(t.templateKey));
  if (toCreate.length === 0) {
    return { created: [], skipped: DEFAULT_CHANNEL_TEMPLATE.map((t) => t.templateKey) };
  }

  const docs = toCreate.map((t) => ({
    workspace: workspaceId,
    case: caseId,
    templateKey: t.templateKey,
    name: t.name,
    slug: t.slug,
    description: t.description,
    order: t.order,
    channelType: t.channelType,
    visibility: t.visibility,
    createdByType: 'system',
    createdByAdmin: null,
  }));

  const created = await WorkspaceChannel.insertMany(docs, { session: session || undefined, ordered: false });
  return { created: created.map((c) => c.templateKey), skipped: [...existingKeys] };
}

/** Read-only preview for the dry-run script and the admin confirmation screen. */
async function previewChannelProvisioning(workspaceId) {
  const existing = await WorkspaceChannel.find({ workspace: workspaceId }, { templateKey: 1 }).lean();
  const existingKeys = new Set(existing.map((c) => c.templateKey).filter(Boolean));
  const missing = DEFAULT_CHANNEL_TEMPLATE.filter((t) => !existingKeys.has(t.templateKey)).map((t) => t.templateKey);
  return { missing, alreadyProvisioned: [...existingKeys] };
}

// ---------------------------------------------------------------------------
// Manager-facing channel customization.
// ---------------------------------------------------------------------------

async function nextOrderFor(workspaceId) {
  const highest = await WorkspaceChannel.findOne({ workspace: workspaceId }).sort({ order: -1 }).select('order').lean();
  return (highest ? highest.order : 0) + 1;
}

async function createChannel({ caseId, workspaceId, name, description, channelType, visibility, actor }) {
  if (!name || !name.trim()) {
    return { outcome: 'validation_error', errors: { name: 'Name is required.' } };
  }
  if (!CHANNEL_TYPES.includes(channelType)) {
    return { outcome: 'validation_error', errors: { channelType: 'Invalid channel type.' } };
  }
  if (!CHANNEL_VISIBILITY.includes(visibility)) {
    return { outcome: 'validation_error', errors: { visibility: 'Invalid visibility.' } };
  }

  const slug = slugify(name, { lower: true, strict: true });
  const existing = await WorkspaceChannel.findOne({ workspace: workspaceId, slug, archivedAt: null });
  if (existing) {
    return { outcome: 'validation_error', errors: { name: 'A channel with this name already exists.' } };
  }

  const order = await nextOrderFor(workspaceId);
  const channel = await WorkspaceChannel.create({
    workspace: workspaceId,
    case: caseId,
    templateKey: null,
    name: name.trim(),
    slug,
    description: (description || '').trim(),
    order,
    channelType,
    visibility,
    createdByType: actor.type === 'admin_user' ? 'admin_user' : actor.type === 'env_fallback' ? 'env_fallback' : 'system',
    createdByAdmin: actor.type === 'admin_user' ? actor.id : null,
  });

  try {
    await CaseActivity.record({
      caseId,
      workspaceId,
      type: 'channel_created',
      message: `Channel "${channel.name}" created by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[collaboration] audit failed after channel creation:', err.message);
  }

  return { outcome: 'created', channel };
}

async function updateChannel({ channelId, name, description, visibility, actor }) {
  const channel = await WorkspaceChannel.findById(channelId);
  if (!channel) return { outcome: 'not_found' };

  const visibilityChanged = visibility && CHANNEL_VISIBILITY.includes(visibility) && visibility !== channel.visibility;

  if (name && name.trim() && name.trim() !== channel.name) {
    const slug = slugify(name, { lower: true, strict: true });
    const conflict = await WorkspaceChannel.findOne({
      workspace: channel.workspace,
      slug,
      archivedAt: null,
      _id: { $ne: channel._id },
    });
    if (conflict) {
      return { outcome: 'validation_error', errors: { name: 'A channel with this name already exists.' } };
    }
    channel.name = name.trim();
    channel.slug = slug;
  }
  if (typeof description === 'string') channel.description = description.trim();
  if (visibilityChanged) channel.visibility = visibility;

  await channel.save();

  try {
    await CaseActivity.record({
      caseId: channel.case,
      workspaceId: channel.workspace,
      type: visibilityChanged ? 'channel_visibility_changed' : 'channel_renamed',
      message: `Channel "${channel.name}" updated by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[collaboration] audit failed after channel update:', err.message);
  }

  return { outcome: 'updated', channel };
}

async function archiveChannel({ channelId, actor }) {
  const channel = await WorkspaceChannel.findById(channelId);
  if (!channel) return { outcome: 'not_found' };
  if (channel.archivedAt) return { outcome: 'unchanged', channel };

  channel.archivedAt = new Date();
  await channel.save();

  try {
    await CaseActivity.record({
      caseId: channel.case,
      workspaceId: channel.workspace,
      type: 'channel_archived',
      message: `Channel "${channel.name}" archived by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[collaboration] audit failed after archiving a channel:', err.message);
  }

  return { outcome: 'updated', channel };
}

/**
 * Reorders a workspace's active channels to match `orderedChannelIds`
 * exactly. Two-phase update (temporary negative orders, then final
 * positive ones) so the unique-partial `(workspace, order)` index never
 * sees a transient collision mid-reorder — same technique ADR-004 §18
 * established for DocumentCategory.
 */
async function reorderChannels({ workspaceId, orderedChannelIds, actor }) {
  if (!Array.isArray(orderedChannelIds) || orderedChannelIds.length === 0) {
    return { outcome: 'validation_error', errors: { order: 'No channels provided.' } };
  }

  const channels = await WorkspaceChannel.find({ workspace: workspaceId, archivedAt: null });
  const channelIds = new Set(channels.map((c) => String(c._id)));
  const requestedIds = orderedChannelIds.map(String);

  if (requestedIds.some((id) => !channelIds.has(id))) {
    return { outcome: 'validation_error', errors: { order: 'One or more channels do not belong to this workspace.' } };
  }
  if (new Set(requestedIds).size !== channelIds.size || requestedIds.length !== channelIds.size) {
    return { outcome: 'validation_error', errors: { order: 'The full set of active channels must be provided.' } };
  }

  const alreadyInOrder = requestedIds.every((id, index) => {
    const channel = channels.find((c) => String(c._id) === id);
    return channel.order === index + 1;
  });
  if (alreadyInOrder) return { outcome: 'unchanged' };

  await Promise.all(
    requestedIds.map((id, index) => WorkspaceChannel.updateOne({ _id: id }, { $set: { order: -1 * (index + 1) } })),
  );
  await Promise.all(
    requestedIds.map((id, index) => WorkspaceChannel.updateOne({ _id: id }, { $set: { order: index + 1 } })),
  );

  try {
    await CaseActivity.record({
      caseId: channels[0].case,
      workspaceId,
      type: 'channel_reordered',
      message: `Channels reordered by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[collaboration] audit failed after reordering channels:', err.message);
  }

  return { outcome: 'updated' };
}

// ---------------------------------------------------------------------------
// Restricted-channel membership.
// ---------------------------------------------------------------------------

async function addChannelMember({ channelId, workspaceMemberId, actor }) {
  const channel = await WorkspaceChannel.findById(channelId);
  if (!channel) return { outcome: 'not_found' };

  const workspaceMember = await WorkspaceMember.findOne({
    _id: workspaceMemberId,
    workspace: channel.workspace,
    status: 'active',
  });
  if (!workspaceMember) {
    return { outcome: 'validation_error', errors: { workspaceMember: 'Not a valid, active member of this workspace.' } };
  }

  const existing = await ChannelMember.findOne({ channel: channel._id, workspaceMember: workspaceMember._id });
  let member;
  if (existing) {
    existing.status = 'active';
    existing.removedAt = null;
    existing.addedBy = actor.type === 'admin_user' ? actor.id : existing.addedBy;
    existing.addedByType = actor.type;
    await existing.save();
    member = existing;
  } else {
    member = await ChannelMember.create({
      channel: channel._id,
      workspaceMember: workspaceMember._id,
      status: 'active',
      addedBy: actor.type === 'admin_user' ? actor.id : null,
      addedByType: actor.type,
      joinedAt: new Date(),
    });
  }

  try {
    await CaseActivity.record({
      caseId: channel.case,
      workspaceId: channel.workspace,
      type: 'channel_member_added',
      message: `A member was added to "${channel.name}" by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[collaboration] audit failed after adding a channel member:', err.message);
  }

  return { outcome: 'updated', member };
}

async function removeChannelMember({ channelId, memberId, actor }) {
  const channel = await WorkspaceChannel.findById(channelId);
  if (!channel) return { outcome: 'not_found' };

  const member = await ChannelMember.findOne({ _id: memberId, channel: channel._id });
  if (!member) return { outcome: 'not_found' };
  if (member.status === 'removed') return { outcome: 'unchanged', member };

  member.status = 'removed';
  member.removedAt = new Date();
  await member.save();

  try {
    await CaseActivity.record({
      caseId: channel.case,
      workspaceId: channel.workspace,
      type: 'channel_member_removed',
      message: `A member was removed from "${channel.name}" by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[collaboration] audit failed after removing a channel member:', err.message);
  }

  return { outcome: 'updated', member };
}

module.exports = {
  provisionDefaultChannels,
  previewChannelProvisioning,
  createChannel,
  updateChannel,
  archiveChannel,
  reorderChannels,
  addChannelMember,
  removeChannelMember,
};
