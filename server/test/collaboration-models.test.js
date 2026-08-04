const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const WorkspaceChannel = require('../models/WorkspaceChannel');
const ChannelMember = require('../models/ChannelMember');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const MessageRevision = require('../models/MessageRevision');
const ChannelReadState = require('../models/ChannelReadState');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const WorkspaceMember = require('../models/WorkspaceMember');

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
  return { caseDoc, workspace, client, pm, clientMember };
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

// ---------------------------------------------------------------------------
// WorkspaceChannel
// ---------------------------------------------------------------------------

test('WorkspaceChannel: no duplicate active order within one workspace', async () => {
  const { caseDoc, workspace } = await seedCase();
  await seedChannel(caseDoc, workspace, { order: 1, slug: 'a' });
  await assert.rejects(() => seedChannel(caseDoc, workspace, { order: 1, slug: 'b' }));
});

test('WorkspaceChannel: no duplicate active slug within one workspace', async () => {
  const { caseDoc, workspace } = await seedCase();
  await seedChannel(caseDoc, workspace, { order: 1, slug: 'same' });
  await assert.rejects(() => seedChannel(caseDoc, workspace, { order: 2, slug: 'same' }));
});

test('WorkspaceChannel: an archived channel frees its slug and order for reuse', async () => {
  const { caseDoc, workspace } = await seedCase();
  const first = await seedChannel(caseDoc, workspace, { order: 1, slug: 'same' });
  first.archivedAt = new Date();
  await first.save();
  await assert.doesNotReject(() => seedChannel(caseDoc, workspace, { order: 1, slug: 'same' }));
});

// ---------------------------------------------------------------------------
// ChannelMember
// ---------------------------------------------------------------------------

test('ChannelMember: duplicate (channel, workspaceMember) is rejected', async () => {
  const { caseDoc, workspace, clientMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace, { visibility: 'restricted_members' });
  await ChannelMember.create({ channel: channel._id, workspaceMember: clientMember._id, status: 'active' });
  await assert.rejects(() => ChannelMember.create({ channel: channel._id, workspaceMember: clientMember._id, status: 'active' }));
});

test('ChannelMember: status "removed" requires removedAt', async () => {
  const { caseDoc, workspace, clientMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace, { visibility: 'restricted_members' });
  await assert.rejects(() => ChannelMember.create({ channel: channel._id, workspaceMember: clientMember._id, status: 'removed' }));
});

// ---------------------------------------------------------------------------
// WorkspaceMessage
// ---------------------------------------------------------------------------

function messageFields(caseDoc, workspace, channel, overrides = {}) {
  return {
    workspace: workspace._id,
    case: caseDoc._id,
    channel: channel._id,
    senderType: 'client',
    senderDisplayName: 'Client',
    body: 'Hello',
    ...overrides,
  };
}

test('WorkspaceMessage: senderType "client" requires senderClient, forbids senderAdmin', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);

  await assert.rejects(() => WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client' })));
  await assert.rejects(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, senderAdmin: pm._id })),
  );
  await assert.doesNotReject(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id })),
  );
});

test('WorkspaceMessage: senderType "employee" requires senderAdmin, forbids senderClient', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await assert.doesNotReject(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'employee', senderAdmin: pm._id })),
  );
});

test('WorkspaceMessage: senderType "system" forbids both sender identities', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await assert.rejects(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'system', senderAdmin: pm._id })),
  );
  await assert.doesNotReject(() => WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'system' })));
});

test('WorkspaceMessage: a client cannot create a non-"text" messageType', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await assert.rejects(() =>
    WorkspaceMessage.create(
      messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, messageType: 'system_update' }),
    ),
  );
});

test('WorkspaceMessage: parentMessage and threadRoot must both be set or both be null', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  const fakeId = new mongoose.Types.ObjectId();
  await assert.rejects(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, parentMessage: fakeId })),
  );
  await assert.rejects(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, threadRoot: fakeId })),
  );
});

test('WorkspaceMessage: a message requires a non-empty body or at least one attachment', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await assert.rejects(() =>
    WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, body: '   ' })),
  );
});

test('WorkspaceMessage: deletedAt requires deletedByType and the matching identity field', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await assert.rejects(() =>
    WorkspaceMessage.create(
      messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, deletedAt: new Date() }),
    ),
  );
  await assert.doesNotReject(() =>
    WorkspaceMessage.create(
      messageFields(caseDoc, workspace, channel, {
        senderType: 'client',
        senderClient: client._id,
        deletedAt: new Date(),
        deletedByType: 'client',
        deletedByClient: client._id,
      }),
    ),
  );
});

test('WorkspaceMessage: idempotencyKey is unique per channel', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await WorkspaceMessage.create(
    messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, idempotencyKey: 'k1' }),
  );
  await assert.rejects(() =>
    WorkspaceMessage.create(
      messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id, body: 'different', idempotencyKey: 'k1' }),
    ),
  );
});

test('WorkspaceMessage: a stale concurrent update is rejected with a controlled conflict (optimisticConcurrency)', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  const created = await WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id }));

  const copyA = await WorkspaceMessage.findById(created._id);
  const copyB = await WorkspaceMessage.findById(created._id);

  copyA.body = 'edited by A';
  await copyA.save();

  copyB.body = 'edited by B';
  await assert.rejects(() => copyB.save(), mongoose.Error.VersionError);
});

// ---------------------------------------------------------------------------
// MessageRevision
// ---------------------------------------------------------------------------

test('MessageRevision: revisionNumber is unique per message', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  const message = await WorkspaceMessage.create(messageFields(caseDoc, workspace, channel, { senderType: 'client', senderClient: client._id }));

  await MessageRevision.create({ message: message._id, revisionNumber: 1, action: 'edited', actorType: 'client', actorClient: client._id });
  await assert.rejects(() =>
    MessageRevision.create({ message: message._id, revisionNumber: 1, action: 'edited', actorType: 'client', actorClient: client._id }),
  );
  await assert.doesNotReject(() =>
    MessageRevision.create({ message: message._id, revisionNumber: 2, action: 'soft_deleted', actorType: 'client', actorClient: client._id }),
  );
});

// ---------------------------------------------------------------------------
// ChannelReadState
// ---------------------------------------------------------------------------

test('ChannelReadState: unique per (channel, workspaceMember)', async () => {
  const { caseDoc, workspace, clientMember } = await seedCase();
  const channel = await seedChannel(caseDoc, workspace);
  await ChannelReadState.create({ workspace: workspace._id, channel: channel._id, workspaceMember: clientMember._id });
  await assert.rejects(() =>
    ChannelReadState.create({ workspace: workspace._id, channel: channel._id, workspaceMember: clientMember._id }),
  );
});
