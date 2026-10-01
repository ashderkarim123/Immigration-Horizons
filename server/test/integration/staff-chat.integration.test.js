process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const os = require('os');
const path = require('path');

// Must precede the first require of documentUploadService (storage provider reads it at load).
process.env.PRIVATE_DOCUMENT_ROOT = path.join(os.tmpdir(), `ih-staff-chat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('fs/promises');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMessage = require('../../models/WorkspaceMessage');
const ChannelMember = require('../../models/ChannelMember');
const CaseDocument = require('../../models/CaseDocument');
const DocumentVersion = require('../../models/DocumentVersion');
const DocumentCategory = require('../../models/DocumentCategory');
const MessageRevision = require('../../models/MessageRevision');

const messageService = require('../../services/messageService');
const readStateService = require('../../services/readStateService');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF');

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(async () => {
  await stopTestDb();
  await fsp.rm(process.env.PRIVATE_DOCUMENT_ROOT, { recursive: true, force: true }).catch(() => {});
});
test.beforeEach(clearCollections);

async function staffAgent(role, { member = null } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  if (member) {
    await WorkspaceMember.create({ workspace: member._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'project_manager', status: 'active' });
  }
  const agent = request.agent(app);
  const login = await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, user };
}

/** A case with a client member, plus a client-visible and a staff-only channel. */
async function seedCase() {
  const client = await ClientUser.create({
    email: `${unique('client')}@example.com`,
    normalizedEmail: `${unique('client')}@example.com`,
    passwordHash: 'x',
    firstName: 'Casey',
    status: 'active',
  });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  const clientMember = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  const channel = (overrides) =>
    WorkspaceChannel.create({
      workspace: workspace._id,
      case: caseDoc._id,
      slug: unique('ch'),
      channelType: 'standard',
      ...overrides,
    });
  const shared = await channel({ name: 'Client & Team', order: 101, visibility: 'clients_and_team' });
  const internal = await channel({ name: 'Strategy', order: 102, visibility: 'employees_only', channelType: 'internal' });
  return { client, caseDoc, workspace, clientMember, shared, internal, channel };
}

const send = (agent, channelId, body, extra = {}) =>
  agent.post(`/api/v1/staff/channels/${channelId}/messages`).set('Origin', ORIGIN).send({ body, idempotencyKey: unique('key'), ...extra });

// ---------------------------------------------------------------------------
// Round trip with the client writer
// ---------------------------------------------------------------------------

test('client message is visible to staff; staff reply is stored in the same domain with deterministic order', async () => {
  const { client, workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });

  await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'Question from client', idempotencyKey: 'client-1' });

  const sent = await send(agent, shared._id, 'Answer from staff');
  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.senderType, 'employee');
  assert.equal(sent.body.data.isOwn, true);

  const list = await agent.get(`/api/v1/staff/channels/${shared._id}/messages`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.messages.map((m) => m.body), ['Question from client', 'Answer from staff']);
  assert.equal(list.body.data.messages[0].senderType, 'client');
  assert.equal(await WorkspaceMessage.countDocuments({ channel: shared._id }), 2);
});

test('replies are normalized to the thread root and listed via the thread endpoint', async () => {
  const { client, workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const root = await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'Root', idempotencyKey: 'r1' });

  const first = await agent.post(`/api/v1/staff/messages/${root.message._id}/replies`).set('Origin', ORIGIN).send({ body: 'Reply 1', idempotencyKey: 'reply-key-1' });
  assert.equal(first.status, 201);
  const second = await agent.post(`/api/v1/staff/messages/${first.body.data.id}/replies`).set('Origin', ORIGIN).send({ body: 'Reply to reply', idempotencyKey: 'reply-key-2' });
  assert.equal(second.body.data.threadRootId, String(root.message._id));

  const thread = await agent.get(`/api/v1/staff/channels/${shared._id}/threads/${root.message._id}`);
  assert.equal(thread.status, 200);
  assert.equal(thread.body.data.root.replyCount, 2);
  assert.deepEqual(thread.body.data.replies.map((m) => m.body), ['Reply 1', 'Reply to reply']);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('retrying a send with the same idempotency key does not duplicate the message', async () => {
  const { workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const key = 'one-deliberate-send';

  const first = await send(agent, shared._id, 'Hello', { idempotencyKey: key });
  const retry = await send(agent, shared._id, 'Hello', { idempotencyKey: key });
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(await WorkspaceMessage.countDocuments({ channel: shared._id }), 1);
});

test('a send without an idempotency key is rejected', async () => {
  const { workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const res = await agent.post(`/api/v1/staff/channels/${shared._id}/messages`).set('Origin', ORIGIN).send({ body: 'No key' });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Authorization / concealment
// ---------------------------------------------------------------------------

test('a staff member without workspace membership cannot see channels, messages or send; every denial is the same 404', async () => {
  const { shared, caseDoc } = await seedCase();
  const { agent } = await staffAgent('pm'); // role allows chat, but NOT a member of this case
  await WorkspaceMessage.create({ workspace: shared.workspace, case: caseDoc._id, channel: shared._id, senderType: 'system', senderDisplayName: 'System', body: 'secret' });

  const guessed = await agent.get(`/api/v1/staff/channels/${shared._id}/messages`);
  const unknown = await agent.get('/api/v1/staff/channels/64b7f0c2a1b2c3d4e5f60718/messages');
  const malformed = await agent.get('/api/v1/staff/channels/not-an-id/messages');
  const caseChannels = await agent.get(`/api/v1/staff/cases/${caseDoc._id}/channels`);
  const sendAttempt = await send(agent, shared._id, 'hi');

  for (const res of [guessed, unknown, malformed, caseChannels, sendAttempt]) assert.equal(res.status, 404);
  assert.deepEqual(guessed.body.error.message, unknown.body.error.message.replace('Channel', 'Channel'));
});

test('a removed workspace member loses access immediately', async () => {
  const { workspace, shared } = await seedCase();
  const { agent, user } = await staffAgent('pm', { member: workspace });
  assert.equal((await agent.get(`/api/v1/staff/channels/${shared._id}/messages`)).status, 200);

  await WorkspaceMember.updateOne({ workspace: workspace._id, adminUser: user._id }, { $set: { status: 'removed' } });
  assert.equal((await agent.get(`/api/v1/staff/channels/${shared._id}/messages`)).status, 404);
});

test('restricted channels need a ChannelMember row; an org-wide admin can still view', async () => {
  const { workspace, channel } = await seedCase();
  const restricted = await channel({ name: 'Restricted', order: 103, visibility: 'restricted_members' });
  const { agent: pmAgent, user: pm } = await staffAgent('pm', { member: workspace });

  assert.equal((await pmAgent.get(`/api/v1/staff/channels/${restricted._id}/messages`)).status, 404);

  const pmMember = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: pm._id });
  await ChannelMember.create({ channel: restricted._id, workspaceMember: pmMember._id, status: 'active', addedByType: 'system', joinedAt: new Date() });
  assert.equal((await pmAgent.get(`/api/v1/staff/channels/${restricted._id}/messages`)).status, 200);

  const { agent: adminAgent } = await staffAgent('admin');
  assert.equal((await adminAgent.get(`/api/v1/staff/channels/${restricted._id}/messages`)).status, 200);
});

test('channel list labels the audience of each channel and counts unread excluding own sends', async () => {
  const { client, caseDoc, workspace, shared, internal } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'Ping', idempotencyKey: 'u1' });
  await send(agent, shared._id, 'My own message');

  const res = await agent.get(`/api/v1/staff/cases/${caseDoc._id}/channels`);
  assert.equal(res.status, 200);
  const byName = Object.fromEntries(res.body.data.channels.map((c) => [c.name, c]));
  assert.equal(byName['Client & Team'].audience, 'client_and_team');
  assert.equal(byName.Strategy.audience, 'staff_only');
  assert.equal(byName['Client & Team'].unreadCount, 1);
  assert.equal(byName.Strategy.unreadCount, 0);

  const read = await agent.post(`/api/v1/staff/channels/${shared._id}/read`).set('Origin', ORIGIN).send({});
  assert.equal(read.status, 200);
  assert.equal(read.body.data.unreadCount, 0);
  assert.ok(internal);
});

test('capability is enforced per mutation: a viewer-level role cannot send', async () => {
  const { workspace, shared } = await seedCase();
  const { agent } = await staffAgent('viewer', { member: workspace });
  assert.equal((await send(agent, shared._id, 'nope')).status, 403);
});

test('mutations reject an untrusted origin', async () => {
  const { workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const res = await agent.post(`/api/v1/staff/channels/${shared._id}/messages`).set('Origin', 'https://evil.example').send({ body: 'x', idempotencyKey: 'abcdefgh1' });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// DTO boundary
// ---------------------------------------------------------------------------

test('message DTOs never carry storage metadata, idempotency keys or deletion reasons', async () => {
  const { workspace, shared, caseDoc } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const upload = await agent.post(`/api/v1/staff/channels/${shared._id}/attachments`).set('Origin', ORIGIN).attach('file', PDF, { filename: 'note.pdf', contentType: 'application/pdf' });
  assert.equal(upload.status, 201);
  await send(agent, shared._id, 'With file', { attachments: [upload.body.data.attachment.documentId] });

  const list = await agent.get(`/api/v1/staff/channels/${shared._id}/messages`);
  const json = JSON.stringify(list.body);
  for (const forbidden of ['storageKey', 'checksum', 'idempotencyKey', 'deletionReason', 'senderAdmin', 'senderClient']) {
    assert.ok(!json.includes(forbidden), `DTO leaked ${forbidden}`);
  }
  const attachment = list.body.data.messages[0].attachments[0];
  assert.equal(attachment.displayName, 'note.pdf');
  assert.equal(attachment.size, PDF.length);
  assert.ok(caseDoc);
});

// ---------------------------------------------------------------------------
// Edit / delete / moderation
// ---------------------------------------------------------------------------

test('edit own records a revision; a stale edit is a controlled 409; edit by a non-author non-moderator is a 404', async () => {
  const { workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const sent = await send(agent, shared._id, 'First draft');
  const { id, updatedAt } = sent.body.data;

  const edited = await agent.patch(`/api/v1/staff/messages/${id}`).set('Origin', ORIGIN).send({ body: 'Second draft', expectedUpdatedAt: updatedAt });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.body, 'Second draft');
  assert.ok(edited.body.data.editedAt);
  assert.equal(await MessageRevision.countDocuments({ message: id, action: 'edited' }), 1);

  const stale = await agent.patch(`/api/v1/staff/messages/${id}`).set('Origin', ORIGIN).send({ body: 'Lost update', expectedUpdatedAt: updatedAt });
  assert.equal(stale.status, 409);
  assert.equal((await WorkspaceMessage.findById(id)).body, 'Second draft');

  const { agent: specialist } = await staffAgent('petition_writer', { member: workspace });
  const foreign = await specialist.patch(`/api/v1/staff/messages/${id}`).set('Origin', ORIGIN).send({ body: 'Hijack' });
  assert.equal(foreign.status, 404);
});

test('soft delete keeps thread continuity; only moderators restore; there is no hard-delete route', async () => {
  const { client, workspace, shared } = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: workspace });
  const { agent: specialist } = await staffAgent('petition_writer', { member: workspace });
  const root = await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'Root', idempotencyKey: 'd1' });
  await pm.post(`/api/v1/staff/messages/${root.message._id}/replies`).set('Origin', ORIGIN).send({ body: 'Reply', idempotencyKey: 'reply-key-d' });

  // A specialist cannot delete someone else's message (no moderate capability).
  assert.equal((await specialist.post(`/api/v1/staff/messages/${root.message._id}/delete`).set('Origin', ORIGIN).send({})).status, 404);

  const deleted = await pm.post(`/api/v1/staff/messages/${root.message._id}/delete`).set('Origin', ORIGIN).send({ reason: 'spam' });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.body, '[This message was deleted.]');
  assert.equal(deleted.body.data.canRestore, true);
  assert.equal(deleted.body.data.replyCount, 1);
  assert.equal((await WorkspaceMessage.countDocuments({ threadRoot: root.message._id })), 1);

  assert.equal((await specialist.post(`/api/v1/staff/messages/${root.message._id}/restore`).set('Origin', ORIGIN).send({})).status, 403);
  const restored = await pm.post(`/api/v1/staff/messages/${root.message._id}/restore`).set('Origin', ORIGIN).send({});
  assert.equal(restored.body.data.body, 'Root');

  assert.equal((await pm.delete(`/api/v1/staff/messages/${root.message._id}`).set('Origin', ORIGIN)).status, 404);
});

// ---------------------------------------------------------------------------
// Incremental sync
// ---------------------------------------------------------------------------

test('incremental sync returns only newer or changed messages, deduplicates by cursor, and hides nothing it should show', async () => {
  const { client, workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'Old', idempotencyKey: 's1' });

  const initial = await agent.get(`/api/v1/staff/channels/${shared._id}/messages`);
  const cursor = initial.body.data.syncCursor;
  assert.ok(cursor);

  const empty = await agent.get(`/api/v1/staff/channels/${shared._id}/messages/newer`).query({ since: cursor });
  assert.equal(empty.body.data.messages.length, 0);
  assert.equal(empty.body.data.syncCursor, cursor);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'Fresh', idempotencyKey: 's2' });
  const oldId = initial.body.data.messages[0].id;
  await messageService.deleteMessage({ messageId: oldId, actor: { type: 'client', id: client._id } });

  const changes = await agent.get(`/api/v1/staff/channels/${shared._id}/messages/newer`).query({ since: cursor });
  assert.deepEqual(changes.body.data.messages.map((m) => m.body).sort(), ['Fresh', '[This message was deleted.]']);

  const again = await agent.get(`/api/v1/staff/channels/${shared._id}/messages/newer`).query({ since: changes.body.data.syncCursor });
  assert.equal(again.body.data.messages.length, 0);

  const malformed = await agent.get(`/api/v1/staff/channels/${shared._id}/messages/newer`).query({ since: '%%%' });
  assert.equal(malformed.status, 200); // malformed cursor degrades to "from the start", never a 500
});

test('history paging is cursor based and bounded', async () => {
  const { client, workspace, shared } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  for (let i = 0; i < 5; i += 1) {
    await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: `m${i}`, idempotencyKey: `p${i}` });
  }
  const page1 = await agent.get(`/api/v1/staff/channels/${shared._id}/messages`).query({ limit: 2 });
  assert.deepEqual(page1.body.data.messages.map((m) => m.body), ['m3', 'm4']);
  const page2 = await agent.get(`/api/v1/staff/channels/${shared._id}/messages`).query({ limit: 2, before: page1.body.data.nextCursor });
  assert.deepEqual(page2.body.data.messages.map((m) => m.body), ['m1', 'm2']);
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

test('direct upload goes through the secure pipeline into a Chat Attachments category and is attachable once', async () => {
  const { workspace, shared, caseDoc } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });

  const upload = await agent.post(`/api/v1/staff/channels/${shared._id}/attachments`).set('Origin', ORIGIN).attach('file', PDF, { filename: 'evidence.pdf', contentType: 'application/pdf' });
  assert.equal(upload.status, 201);
  const { documentId } = upload.body.data.attachment;

  const document = await CaseDocument.findById(documentId);
  const category = await DocumentCategory.findById(document.category);
  assert.equal(category.templateKey, 'chat_attachments');
  assert.equal(document.visibility, 'client_visible');
  assert.equal(document.uploadedByType, 'employee');
  assert.equal(await DocumentVersion.countDocuments({ document: documentId }), 1);

  // Retrying the identical upload reuses the stored document instead of duplicating it.
  const retry = await agent.post(`/api/v1/staff/channels/${shared._id}/attachments`).set('Origin', ORIGIN).attach('file', PDF, { filename: 'evidence.pdf', contentType: 'application/pdf' });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.reused, true);
  assert.equal(retry.body.data.attachment.documentId, documentId);
  assert.equal(await CaseDocument.countDocuments({ case: caseDoc._id }), 1);
  assert.equal(await DocumentCategory.countDocuments({ case: caseDoc._id, templateKey: 'chat_attachments' }), 1);

  const msg = await send(agent, shared._id, 'See attached', { attachments: [documentId] });
  assert.equal(msg.status, 201);
  assert.equal(msg.body.data.attachments[0].documentId, documentId);
});

test('an upload into a staff-only channel is staff-only and can never be attached to a client-visible channel', async () => {
  const { workspace, shared, internal } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });

  const upload = await agent.post(`/api/v1/staff/channels/${internal._id}/attachments`).set('Origin', ORIGIN).attach('file', PDF, { filename: 'strategy.pdf', contentType: 'application/pdf' });
  assert.equal(upload.status, 201);
  const { documentId } = upload.body.data.attachment;
  assert.equal((await CaseDocument.findById(documentId)).visibility, 'employees_only');

  assert.equal((await send(agent, internal._id, 'Internal note', { attachments: [documentId] })).status, 201);
  const leak = await send(agent, shared._id, 'Oops', { attachments: [documentId] });
  assert.equal(leak.status, 400);

  const attachable = await agent.get(`/api/v1/staff/channels/${shared._id}/attachable-documents`);
  assert.equal(attachable.status, 200);
  assert.ok(!attachable.body.data.documents.some((d) => d.documentId === documentId));
});

test('a client-visible channel cannot carry an internal document, even in a restricted channel with a client member', async () => {
  const { workspace, clientMember, caseDoc, channel } = await seedCase();
  const { agent, user } = await staffAgent('pm', { member: workspace });
  const restricted = await channel({ name: 'Restricted', order: 103, visibility: 'restricted_members' });
  const pmMember = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: user._id });
  for (const member of [pmMember, clientMember]) {
    await ChannelMember.create({ channel: restricted._id, workspaceMember: member._id, status: 'active', addedByType: 'system', joinedAt: new Date() });
  }
  const category = await DocumentCategory.create({ case: caseDoc._id, workspace: workspace._id, name: 'Internal', slug: 'internal', order: 1, visibility: 'employees_only', allowedUploaderTypes: 'employee' });
  const internalDoc = await CaseDocument.create({
    case: caseDoc._id, workspace: workspace._id, category: category._id, uploadedByType: 'employee', uploadedByAdmin: user._id,
    originalName: 'x.pdf', displayName: 'x.pdf', storageKey: 'a'.repeat(48), mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 1, checksum: 'c'.repeat(64),
    visibility: 'employees_only', versionCount: 1,
  });
  const version = await DocumentVersion.create({
    document: internalDoc._id, versionNumber: 1, storageKey: 'a'.repeat(48), originalName: 'x.pdf', displayName: 'x.pdf',
    mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 1, checksum: 'c'.repeat(64), uploadedByType: 'employee', uploadedByAdmin: user._id,
  });
  internalDoc.currentVersion = version._id;
  await internalDoc.save();

  assert.equal((await send(agent, restricted._id, 'Leak?', { attachments: [internalDoc._id] })).status, 400);
});

test('a document from another case cannot be attached', async () => {
  const first = await seedCase();
  const second = await seedCase();
  const { agent } = await staffAgent('pm', { member: first.workspace });
  const { agent: other } = await staffAgent('pm', { member: second.workspace });

  const upload = await other.post(`/api/v1/staff/channels/${second.shared._id}/attachments`).set('Origin', ORIGIN).attach('file', PDF, { filename: 'theirs.pdf', contentType: 'application/pdf' });
  const res = await send(agent, first.shared._id, 'Cross-case', { attachments: [upload.body.data.attachment.documentId] });
  assert.equal(res.status, 400);
});

test('upload rejects a magic-byte mismatch and leaves no temp files or documents behind', async () => {
  const { workspace, shared, caseDoc } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const upload = await agent.post(`/api/v1/staff/channels/${shared._id}/attachments`).set('Origin', ORIGIN).attach('file', Buffer.from('MZ not a pdf at all'), { filename: 'fake.pdf', contentType: 'application/pdf' });
  assert.equal(upload.status, 400);
  assert.equal(await CaseDocument.countDocuments({ case: caseDoc._id }), 0);
  const tempDir = path.join(process.env.PRIVATE_DOCUMENT_ROOT, 'temp');
  const leftovers = await fsp.readdir(tempDir).catch(() => []);
  assert.deepEqual(leftovers, []);
});

test('upload into a channel the actor cannot see is the same 404 and stores nothing', async () => {
  const { shared, caseDoc } = await seedCase();
  const { agent } = await staffAgent('pm');
  const upload = await agent.post(`/api/v1/staff/channels/${shared._id}/attachments`).set('Origin', ORIGIN).attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
  assert.equal(upload.status, 404);
  assert.equal(await CaseDocument.countDocuments({ case: caseDoc._id }), 0);
});

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

test('initialize is idempotent', async () => {
  const { caseDoc } = await seedCase();
  const { agent } = await staffAgent('admin');
  const first = await agent.post(`/api/v1/staff/cases/${caseDoc._id}/channels/initialize`).set('Origin', ORIGIN).send({});
  const second = await agent.post(`/api/v1/staff/cases/${caseDoc._id}/channels/initialize`).set('Origin', ORIGIN).send({});
  assert.equal(first.status, 200);
  assert.equal(second.body.data.created.length, 0);
});

test('read state: marking read is monotonic and own messages never count', async () => {
  const { client, workspace, shared } = await seedCase();
  const { agent, user } = await staffAgent('pm', { member: workspace });
  const member = await WorkspaceMember.findOne({ workspace: workspace._id, adminUser: user._id });
  await messageService.createMessage({ channel: shared, senderType: 'client', senderClientId: client._id, senderDisplayName: 'Casey', body: 'a', idempotencyKey: 'rs1' });
  assert.equal(await readStateService.getUnreadCount({ channel: shared, workspaceMemberId: member._id, selfAdminId: user._id }), 1);
  const read = await agent.post(`/api/v1/staff/channels/${shared._id}/read`).set('Origin', ORIGIN).send({});
  assert.equal(read.body.data.unreadCount, 0);
});
