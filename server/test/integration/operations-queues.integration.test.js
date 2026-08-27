process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');

const { createApp } = require('../../app');
const ClientUser = require('../../models/ClientUser');
const AdminUser = require('../../models/admin/User');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMessage = require('../../models/WorkspaceMessage');
const ChannelReadState = require('../../models/ChannelReadState');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const DocumentCategory = require('../../models/DocumentCategory');
const CaseDocument = require('../../models/CaseDocument');
const DocumentRequest = require('../../models/DocumentRequest');
const CaseActivity = require('../../models/CaseActivity');

const { getOperationalCounts, STALLED_CASE_DAYS } = require('../../services/operationsQueues');
const { generateInteractionNumber } = require('../../utils/interactionNumber');

let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return { agent, user: creds.user };
}

let counter = 0;
async function seedCase(overrides = {}) {
  counter += 1;
  const pm = await AdminUser.create({
    name: `PM ${counter}`,
    email: `pm-ops-${Date.now()}-${counter}@example.com`,
    password: 'x',
    role: 'pm',
  });
  const email = `client-ops-${Date.now()}-${counter}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', status: 'active' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pm._id,
    createdBy: pm._id,
    createdByName: pm.name,
    ...overrides,
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: 'primary',
    name: 'WS',
    createdBy: pm._id,
    createdByName: pm.name,
  });
  return { pm, client, caseDoc, workspace };
}

test('every count is zero on an empty database', async () => {
  const counts = await getOperationalCounts();
  for (const [key, value] of Object.entries(counts)) {
    assert.equal(value, 0, `${key} should start at zero`);
  }
});

test('upcoming filing deadlines counts only active cases inside the 30-day window', async () => {
  await seedCase({ targetFilingDate: new Date(Date.now() + 5 * 86400000) }); // in window
  await seedCase({ targetFilingDate: new Date(Date.now() + 90 * 86400000) }); // too far out
  await seedCase({ targetFilingDate: new Date(Date.now() - 5 * 86400000) }); // already past
  await seedCase({ targetFilingDate: null }); // no deadline

  const archived = await seedCase({ targetFilingDate: new Date(Date.now() + 5 * 86400000) });
  await ClientCase.updateOne({ _id: archived.caseDoc._id }, { $set: { archivedAt: new Date(), status: 'archived' } });

  const counts = await getOperationalCounts();
  assert.equal(counts.upcomingFilingDeadlines, 1);
});

test('stalled cases counts active cases untouched beyond the threshold, and excludes archived ones', async () => {
  const fresh = await seedCase();
  const stale = await seedCase();
  const staleArchived = await seedCase();

  const longAgo = new Date(Date.now() - (STALLED_CASE_DAYS + 5) * 86400000);
  // timestamps: true means updatedAt is managed — set it directly to
  // simulate a case nobody has touched in weeks.
  await ClientCase.collection.updateOne({ _id: stale.caseDoc._id }, { $set: { updatedAt: longAgo } });
  await ClientCase.collection.updateOne(
    { _id: staleArchived.caseDoc._id },
    { $set: { updatedAt: longAgo, archivedAt: new Date(), status: 'archived' } },
  );

  const counts = await getOperationalCounts();
  assert.equal(counts.stalledCases, 1, 'only the active, stale case counts');
  assert.ok(fresh.caseDoc);
});

test('document queues count review-pending, overdue-request, and quarantined documents separately', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: 'Identity',
    slug: `identity-${Math.random().toString(36).slice(2)}`,
    order: 1,
    visibility: 'client_visible',
    allowedUploaderTypes: 'both',
  });

  const baseDoc = {
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: 'client',
    uploadedByClient: client._id,
    originalName: 'f.pdf',
    displayName: 'F',
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: '.pdf',
    size: 10,
    checksum: 'x'.repeat(64),
    visibility: 'client_visible',
  };

  await CaseDocument.create({ ...baseDoc, storageKey: 'k1', status: 'uploaded' });
  await CaseDocument.create({ ...baseDoc, storageKey: 'k2', status: 'pending_review' });
  await CaseDocument.create({ ...baseDoc, storageKey: 'k3', status: 'accepted', reviewedBy: pm._id, reviewedAt: new Date() });
  await CaseDocument.create({ ...baseDoc, storageKey: 'k4', status: 'quarantined' });

  const member = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: 'active',
  });
  await DocumentRequest.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    title: 'Overdue request',
    requestedFrom: member._id,
    requestedBy: pm._id,
    status: 'open',
    dueDate: new Date(Date.now() - 86400000),
  });
  await DocumentRequest.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    title: 'Future request',
    requestedFrom: member._id,
    requestedBy: pm._id,
    status: 'open',
    dueDate: new Date(Date.now() + 86400000),
  });

  const counts = await getOperationalCounts();
  assert.equal(counts.documentsAwaitingReview, 2, 'uploaded + pending_review, not accepted or quarantined');
  assert.equal(counts.overdueDocumentRequests, 1);
  assert.equal(counts.quarantinedDocuments, 1);
});

test('query queues separate unanswered from awaiting-scheduling', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const base = {
    scopeType: 'case',
    clientUser: client._id,
    case: caseDoc._id,
    workspace: workspace._id,
    description: 'x'.repeat(20),
    priority: 'normal',
    createdByType: 'client',
    createdByClient: client._id,
  };

  await ConsultationInteraction.create({
    ...base,
    interactionNumber: generateInteractionNumber(),
    subject: 'Open question',
    type: 'client_question',
    status: 'submitted',
  });
  await ConsultationInteraction.create({
    ...base,
    interactionNumber: generateInteractionNumber(),
    subject: 'Needs a slot',
    type: 'scheduled_consultation',
    status: 'submitted',
    scheduledFor: null,
  });
  await ConsultationInteraction.create({
    ...base,
    interactionNumber: generateInteractionNumber(),
    subject: 'Already booked',
    type: 'scheduled_consultation',
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 86400000),
    timezone: 'UTC',
  });
  await ConsultationInteraction.create({
    ...base,
    interactionNumber: generateInteractionNumber(),
    subject: 'Done',
    type: 'client_question',
    status: 'closed',
    closedAt: new Date(),
  });

  const counts = await getOperationalCounts();
  assert.equal(counts.unansweredQueries, 3, 'submitted/submitted/scheduled are all still unanswered; closed is not');
  assert.equal(counts.queriesAwaitingScheduling, 1, 'only the unscheduled scheduled_consultation');
});

test('unread client messages counts only messages newer than the newest employee read marker', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const channel = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: 'General',
    slug: `general-${Math.random().toString(36).slice(2)}`,
    order: 1,
    channelType: 'standard',
    visibility: 'clients_and_team',
  });

  const first = await WorkspaceMessage.create({
    workspace: workspace._id,
    case: caseDoc._id,
    channel: channel._id,
    senderType: 'client',
    senderClient: client._id,
    senderDisplayName: 'Client',
    body: 'First',
  });
  await WorkspaceMessage.create({
    workspace: workspace._id,
    case: caseDoc._id,
    channel: channel._id,
    senderType: 'employee',
    senderAdmin: pm._id,
    senderDisplayName: 'PM',
    body: 'Employee message never counts',
  });

  let counts = await getOperationalCounts();
  assert.equal(counts.unreadClientMessages, 1, 'unread before anyone reads the channel');

  const pmMember = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'project_manager',
    status: 'active',
  });
  await ChannelReadState.create({
    workspace: workspace._id,
    channel: channel._id,
    workspaceMember: pmMember._id,
    lastReadMessage: first._id,
    lastReadAt: first.createdAt,
  });

  counts = await getOperationalCounts();
  assert.equal(counts.unreadClientMessages, 0, 'read marker clears it');

  await WorkspaceMessage.create({
    workspace: workspace._id,
    case: caseDoc._id,
    channel: channel._id,
    senderType: 'client',
    senderClient: client._id,
    senderDisplayName: 'Client',
    body: 'Newer than the read marker',
  });

  counts = await getOperationalCounts();
  assert.equal(counts.unreadClientMessages, 1, 'a newer client message is unread again');
});

test('the dashboard renders operational counts for a manager and omits them for a viewer', async () => {
  await seedCase({ targetFilingDate: new Date(Date.now() + 3 * 86400000) });

  const manager = await loggedInAs('admin');
  const managerRes = await manager.agent.get('/admin');
  assert.equal(managerRes.status, 200);
  assert.ok(managerRes.text.includes('Operations'));
  assert.ok(managerRes.text.includes('Filing within 30 days'));

  const viewer = await loggedInAs('viewer');
  const viewerRes = await viewer.agent.get('/admin');
  assert.equal(viewerRes.status, 200);
  assert.ok(!viewerRes.text.includes('Filing within 30 days'), 'a viewer has no cases.view and sees no operational queues');
});

// ---------------------------------------------------------------------------
// Client-visible update publishing (ADR-007 §6)
// ---------------------------------------------------------------------------

test('publishing a client update posts a client-visible message and logs the activity', async () => {
  const { agent } = await loggedInAs('admin');
  const { caseDoc, workspace } = await seedCase();
  await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    templateKey: 'case_updates',
    name: 'Case Updates',
    slug: `case-updates-${Math.random().toString(36).slice(2)}`,
    order: 2,
    channelType: 'updates',
    visibility: 'clients_and_team',
  });

  const res = await agent
    .post(`/admin/cases/${caseDoc._id}/client-update`)
    .type('form')
    .send({ body: 'Your petition draft is now in internal review.' });
  assert.equal(res.status, 302);

  const message = await WorkspaceMessage.findOne({ case: caseDoc._id, messageType: 'case_update' }).lean();
  assert.ok(message, 'a case_update message must exist');
  assert.equal(message.senderType, 'system');
  assert.equal(message.clientVisible, true);
  assert.ok(message.body.includes('internal review'));

  const activity = await CaseActivity.findOne({ case: caseDoc._id, type: 'client_update_published' }).lean();
  assert.ok(activity, 'publishing must be recorded on the case timeline');
});

test('publishing is refused without the capability', async () => {
  const { agent } = await loggedInAs('viewer');
  const { caseDoc } = await seedCase();
  const res = await agent
    .post(`/admin/cases/${caseDoc._id}/client-update`)
    .type('form')
    .send({ body: 'Should never post' });
  assert.equal(res.status, 403);
  assert.equal(await WorkspaceMessage.countDocuments({ case: caseDoc._id }), 0);
});

test('publishing into a case with no updates channel reports the problem instead of silently succeeding', async () => {
  const { agent } = await loggedInAs('admin');
  const { caseDoc } = await seedCase(); // no channels provisioned

  const res = await agent
    .post(`/admin/cases/${caseDoc._id}/client-update`)
    .type('form')
    .send({ body: 'No channel exists' });
  assert.equal(res.status, 302);

  assert.equal(await WorkspaceMessage.countDocuments({ case: caseDoc._id }), 0);
  assert.equal(
    await CaseActivity.countDocuments({ case: caseDoc._id, type: 'client_update_published' }),
    0,
    'no activity may be logged for an update that was never posted',
  );
});

test('an empty update body is rejected without posting anything', async () => {
  const { agent } = await loggedInAs('admin');
  const { caseDoc, workspace } = await seedCase();
  await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    templateKey: 'case_updates',
    name: 'Case Updates',
    slug: `case-updates-${Math.random().toString(36).slice(2)}`,
    order: 2,
    channelType: 'updates',
    visibility: 'clients_and_team',
  });

  const res = await agent.post(`/admin/cases/${caseDoc._id}/client-update`).type('form').send({ body: '   ' });
  assert.equal(res.status, 302);
  assert.equal(await WorkspaceMessage.countDocuments({ case: caseDoc._id }), 0);
});
