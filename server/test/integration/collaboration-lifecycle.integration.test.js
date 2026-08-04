process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const ClientUser = require('../../models/ClientUser');
const AdminUser = require('../../models/admin/User');
const WorkspaceMember = require('../../models/WorkspaceMember');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMessage = require('../../models/WorkspaceMessage');
const MessageRevision = require('../../models/MessageRevision');
const Notification = require('../../models/admin/Notification');
const CaseDocument = require('../../models/CaseDocument');
const DocumentCategory = require('../../models/DocumentCategory');
const DocumentVersion = require('../../models/DocumentVersion');

const channelService = require('../../services/channelService');
const messageService = require('../../services/messageService');
const readStateService = require('../../services/readStateService');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function seedCase() {
  const pm = await AdminUser.create({ name: 'PM', email: `pm-${Date.now()}-${Math.random()}@example.com`, password: 'x', role: 'pm' });
  const client = await ClientUser.create({
    email: `client-${Date.now()}-${Math.random()}@example.com`,
    normalizedEmail: `client-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: 'x',
    status: 'active',
  });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pm._id,
    createdBy: pm._id,
    createdByName: pm.name,
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: 'primary',
    name: 'WS',
    createdBy: pm._id,
    createdByName: pm.name,
  });
  const clientMember = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: 'active',
  });
  const pmMember = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'project_manager',
    status: 'active',
  });
  return { caseDoc, workspace, client, pm, clientMember, pmMember };
}

async function seedChannel(caseDoc, workspace, overrides = {}) {
  return WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: 'General',
    slug: `general-${Math.random().toString(36).slice(2)}`,
    order: 1,
    channelType: 'standard',
    visibility: 'clients_and_team',
    ...overrides,
  });
}

test('client sends a message; employee replies; reply count and lastReplyAt update atomically', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const sent = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Hello team',
    idempotencyKey: 'k1',
  });
  assert.equal(sent.outcome, 'created');
  assert.equal(sent.message.threadRoot, null);

  const reply = await messageService.createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: pm._id,
    senderDisplayName: pm.name,
    body: 'On it',
    parentMessageId: sent.message._id,
    idempotencyKey: 'k2',
  });
  assert.equal(reply.outcome, 'created');
  assert.equal(String(reply.message.threadRoot), String(sent.message._id));

  const root = await WorkspaceMessage.findById(sent.message._id).lean();
  assert.equal(root.replyCount, 1);
  assert.ok(root.lastReplyAt);
});

test('a reply targeting another reply is normalized to the original thread root (one level only)', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const top = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Top',
    idempotencyKey: 'a1',
  });
  const reply1 = await messageService.createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: pm._id,
    senderDisplayName: pm.name,
    body: 'Reply 1',
    parentMessageId: top.message._id,
    idempotencyKey: 'a2',
  });
  const reply2 = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Reply to reply 1',
    parentMessageId: reply1.message._id,
    idempotencyKey: 'a3',
  });

  assert.equal(String(reply2.message.threadRoot), String(top.message._id));
  assert.equal(String(reply2.message.parentMessage), String(top.message._id));
});

test('duplicate send with the same idempotencyKey returns the original message, not a second one', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const first = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Hi',
    idempotencyKey: 'dup-1',
  });
  const second = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Hi',
    idempotencyKey: 'dup-1',
  });

  assert.equal(String(first.message._id), String(second.message._id));
  assert.equal(await WorkspaceMessage.countDocuments({ channel: channel._id }), 1);
});

test('editing a message records a revision; an unchanged resubmission creates none', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const sent = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Original',
    idempotencyKey: 'e1',
  });

  const edited = await messageService.editMessage({
    messageId: sent.message._id,
    newBody: 'Updated',
    actor: { type: 'client', id: client._id, name: client.email },
  });
  assert.equal(edited.outcome, 'updated');
  assert.equal(await MessageRevision.countDocuments({ message: sent.message._id }), 1);

  const resubmit = await messageService.editMessage({
    messageId: sent.message._id,
    newBody: 'Updated',
    actor: { type: 'client', id: client._id, name: client.email },
  });
  assert.equal(resubmit.outcome, 'unchanged');
  assert.equal(await MessageRevision.countDocuments({ message: sent.message._id }), 1);
});

test('two genuinely concurrent edits on the same message: exactly one succeeds, the other gets a controlled conflict', async () => {
  // editMessage() always does its own fresh findById, so a sequential
  // "load A, save A, then edit B" test can never observe a stale read —
  // by the time B's internal findById runs, A's save has already
  // committed, so B legitimately sees the latest __v. A real race
  // requires two concurrent requests actually interleaving at the
  // database level, which Promise.allSettled constructs here.
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  const sent = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Original',
    idempotencyKey: 'stale-1',
  });

  const actor = { type: 'client', id: client._id, name: client.email };
  const results = await Promise.allSettled([
    messageService.editMessage({ messageId: sent.message._id, newBody: 'Edited by A', actor }),
    messageService.editMessage({ messageId: sent.message._id, newBody: 'Edited by B', actor }),
  ]);

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.outcome === 'updated');
  const conflicted = results.filter((r) => r.status === 'rejected' && r.reason.isVersionConflict === true);

  assert.equal(succeeded.length, 1, 'exactly one concurrent edit should succeed');
  assert.equal(conflicted.length, 1, 'the other should be rejected as a controlled version conflict, not silently lost');
});

test('soft delete preserves the original body in storage but the serializer hides it', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  const sent = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Secret content',
    idempotencyKey: 'del-1',
  });

  const deleted = await messageService.deleteMessage({ messageId: sent.message._id, actor: { type: 'client', id: client._id, name: client.email } });
  assert.equal(deleted.outcome, 'updated');

  const raw = await WorkspaceMessage.findById(sent.message._id).lean();
  assert.equal(raw.body, 'Secret content'); // preserved in storage/revision history
  const serialized = messageService.serializeMessage(raw);
  assert.equal(serialized.body, '[This message was deleted.]');
});

test('a mention notifies the mentioned employee exactly once; editing to add a mention notifies only the newly added one', async () => {
  const { caseDoc, workspace, client, pm, pmMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const sent = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Hey @pm',
    mentionWorkspaceMemberIds: [pmMember._id],
    idempotencyKey: 'mention-1',
  });
  assert.equal(sent.outcome, 'created');
  assert.equal(sent.message.mentions.length, 1);

  const mentionNotifications = await Notification.countDocuments({ type: 'message_mention', recipientName: pm.name });
  assert.equal(mentionNotifications, 1);

  // Editing WITHOUT changing mentions must not create a second notification.
  await messageService.editMessage({
    messageId: sent.message._id,
    newBody: 'Hey @pm, edited',
    mentionWorkspaceMemberIds: [pmMember._id],
    actor: { type: 'client', id: client._id, name: client.email },
  });
  assert.equal(await Notification.countDocuments({ type: 'message_mention', recipientName: pm.name }), 1);
});

test('mentioning a non-active workspace member is rejected', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  const fakeId = new (require('mongoose').Types.ObjectId)();

  const result = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Hey',
    mentionWorkspaceMemberIds: [fakeId],
    idempotencyKey: 'mention-invalid',
  });
  assert.equal(result.outcome, 'validation_error');
});

test('attaching a document from a different case is rejected; a valid attachment is accepted', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const { caseDoc: otherCase, workspace: otherWorkspace } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: 'Docs',
    slug: 'docs',
    order: 1,
    visibility: 'client_visible',
    allowedUploaderTypes: 'both',
  });
  const document = await CaseDocument.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: 'client',
    uploadedByClient: client._id,
    originalName: 'x.pdf',
    displayName: 'x.pdf',
    storageKey: 'a'.repeat(48),
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: '.pdf',
    size: 10,
    checksum: 'b'.repeat(64),
    status: 'uploaded',
    visibility: 'client_visible',
  });
  const version = await DocumentVersion.create({
    document: document._id,
    versionNumber: 1,
    storageKey: document.storageKey,
    originalName: 'x.pdf',
    displayName: 'x.pdf',
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: '.pdf',
    size: 10,
    checksum: document.checksum,
    uploadedByType: 'client',
    uploadedByClient: client._id,
  });
  document.currentVersion = version._id;
  await document.save();

  const otherChannel = await seedChannel(otherCase, otherWorkspace);
  const crossCaseResult = await messageService.createMessage({
    channel: otherChannel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'See attached',
    attachmentDocumentIds: [document._id],
    idempotencyKey: 'attach-cross',
  });
  assert.equal(crossCaseResult.outcome, 'validation_error');

  const validResult = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'See attached',
    attachmentDocumentIds: [document._id],
    idempotencyKey: 'attach-valid',
  });
  assert.equal(validResult.outcome, 'created');
  assert.equal(validResult.message.attachments.length, 1);
  assert.equal(String(validResult.message.attachments[0].documentVersion), String(version._id));
});

test('read state: monotonic — marking read with an older message never moves the marker backward', async () => {
  const { caseDoc, workspace, client, clientMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const first = await messageService.createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: (await seedCase()).pm._id,
    senderDisplayName: 'PM',
    body: 'First',
    idempotencyKey: 'read-1',
  });
  const second = await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'Second',
    idempotencyKey: 'read-2',
  });

  const markedLatest = await readStateService.markChannelRead({ channel, workspaceMemberId: clientMember._id, lastReadMessageId: second.message._id });
  assert.equal(markedLatest.outcome, 'updated');

  const markedOlder = await readStateService.markChannelRead({ channel, workspaceMemberId: clientMember._id, lastReadMessageId: first.message._id });
  assert.equal(markedOlder.outcome, 'unchanged');

  const finalState = await require('../../models/ChannelReadState').findOne({ channel: channel._id, workspaceMember: clientMember._id }).lean();
  assert.equal(String(finalState.lastReadMessage), String(second.message._id));
});

test('unread count excludes the reader\'s own messages by default', async () => {
  const { caseDoc, workspace, client, clientMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  await messageService.createMessage({
    channel,
    senderType: 'client',
    senderClientId: client._id,
    senderDisplayName: client.email,
    body: 'My own message',
    idempotencyKey: 'unread-own',
  });

  const count = await readStateService.getUnreadCount({ channel, workspaceMemberId: clientMember._id, selfClientId: client._id });
  assert.equal(count, 0);
});

test('unread count reflects a new message from someone else and drops to zero after marking read', async () => {
  const { caseDoc, workspace, client, pm, clientMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  const fromPm = await messageService.createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: pm._id,
    senderDisplayName: pm.name,
    body: 'Update',
    idempotencyKey: 'unread-pm',
  });

  const before = await readStateService.getUnreadCount({ channel, workspaceMemberId: clientMember._id, selfClientId: client._id });
  assert.equal(before, 1);

  await readStateService.markChannelRead({ channel, workspaceMemberId: clientMember._id, lastReadMessageId: fromPm.message._id });

  const after = await readStateService.getUnreadCount({ channel, workspaceMemberId: clientMember._id, selfClientId: client._id });
  assert.equal(after, 0);
});

test('channel provisioning is idempotent — re-running creates no duplicates', async () => {
  const { caseDoc, workspace } = await seedCase();
  const first = await channelService.provisionDefaultChannels({ caseId: caseDoc._id, workspaceId: workspace._id });
  assert.equal(first.created.length, 6);

  const second = await channelService.provisionDefaultChannels({ caseId: caseDoc._id, workspaceId: workspace._id });
  assert.equal(second.created.length, 0);

  assert.equal(await WorkspaceChannel.countDocuments({ workspace: workspace._id }), 6);
});

test('reorderChannels rejects a channel id belonging to a different workspace', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { caseDoc: otherCase, workspace: otherWorkspace } = await seedCase();
  const own = await seedChannel(caseDoc, workspace, { order: 1 });
  const foreign = await seedChannel(otherCase, otherWorkspace, { order: 1 });

  const result = await channelService.reorderChannels({
    workspaceId: workspace._id,
    orderedChannelIds: [String(own._id), String(foreign._id)],
    actor: { id: null, name: 'Test', type: 'system' },
  });
  assert.equal(result.outcome, 'validation_error');
});

test('reorderChannels reassigns order values without a unique-index collision', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const a = await seedChannel(caseDoc, workspace, { order: 1, slug: 'a', name: 'A' });
  const b = await seedChannel(caseDoc, workspace, { order: 2, slug: 'b', name: 'B' });

  const result = await channelService.reorderChannels({
    workspaceId: workspace._id,
    orderedChannelIds: [String(b._id), String(a._id)],
    actor: { id: pm._id, name: pm.name, type: 'admin_user' },
  });
  assert.equal(result.outcome, 'updated');

  const reloadedA = await WorkspaceChannel.findById(a._id);
  const reloadedB = await WorkspaceChannel.findById(b._id);
  assert.equal(reloadedB.order, 1);
  assert.equal(reloadedA.order, 2);
});

// ---------------------------------------------------------------------------
// Leakage tests
// ---------------------------------------------------------------------------

test('LEAKAGE: an employees_only channel is excluded from a client-computed accessible channel list', async () => {
  const { caseDoc, workspace } = await seedCase();
  await seedChannel(caseDoc, workspace, { visibility: 'clients_and_team', slug: 'public', order: 1 });
  await seedChannel(caseDoc, workspace, { visibility: 'employees_only', slug: 'internal', order: 2 });

  const { CLIENT_ACCESSIBLE_VISIBILITY } = require('../../utils/collaborationConstants');
  const clientVisible = await WorkspaceChannel.find({ workspace: workspace._id, visibility: { $in: CLIENT_ACCESSIBLE_VISIBILITY } }).lean();
  assert.equal(clientVisible.length, 1);
  assert.equal(clientVisible[0].slug, 'public');
});

test('LEAKAGE: an internal system message (clientVisible: false) is excluded from a client-visible message query', async () => {
  const { caseDoc, workspace } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  await messageService.createMessage({
    channel,
    senderType: 'system',
    senderDisplayName: 'System',
    body: 'Internal-only note',
    messageType: 'case_update',
    clientVisible: false,
    idempotencyKey: 'internal-1',
  });
  await messageService.createMessage({
    channel,
    senderType: 'system',
    senderDisplayName: 'System',
    body: 'Client-visible note',
    messageType: 'case_update',
    clientVisible: true,
    idempotencyKey: 'internal-2',
  });

  const clientVisibleMessages = await WorkspaceMessage.find({ channel: channel._id, clientVisible: true }).lean();
  assert.equal(clientVisibleMessages.length, 1);
  assert.equal(clientVisibleMessages[0].body, 'Client-visible note');
});
