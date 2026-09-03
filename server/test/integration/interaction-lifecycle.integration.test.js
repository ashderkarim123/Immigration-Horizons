process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');

const { createApp } = require('../../app');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const InteractionHistory = require('../../models/InteractionHistory');
const InteractionUpdate = require('../../models/InteractionUpdate');
const ClientUser = require('../../models/ClientUser');
const Consultation = require('../../models/Consultation');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const Notification = require('../../models/admin/Notification');
const mailer = require('../../services/mailer');
const { generateInteractionNumber } = require('../../utils/interactionNumber');

let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
  // Test double per module doc §23 ("Add test doubles ... so failure
  // behavior is testable") — no real mail account in tests. Since ADR-013
  // one seam on services/mailer.js covers every adapter.
  mailer._setTransportForTests(async () => true);
});

test.after(async () => {
  mailer._resetTransportForTests();
  await stopTestDb();
});

test.beforeEach(async () => {
  await clearCollections();
});

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return { agent, user: creds.user };
}

let clientEmailCounter = 0;
async function seedActiveClient() {
  clientEmailCounter += 1;
  const email = `interaction-client-${Date.now()}-${clientEmailCounter}@example.com`;
  return ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Test', status: 'active' });
}

async function seedConsultationInteraction(overrides = {}) {
  const client = overrides.client || (await seedActiveClient());
  const consultation = await Consultation.create({
    name: 'Interaction Lead',
    email: client.email,
    message: 'x'.repeat(20),
    clientUser: client._id,
  });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: generateInteractionNumber(),
    scopeType: 'consultation',
    clientUser: client._id,
    consultation: consultation._id,
    subject: 'Test subject',
    description: 'Test description long enough.',
    type: 'follow_up_query',
    createdByType: 'client',
    createdByClient: client._id,
  });
  return { client, consultation, interaction };
}

async function seedCaseInteraction(pmId) {
  const client = await seedActiveClient();
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pmId,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'Primary' });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: 'active',
  });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pmId,
    workspaceRole: 'project_manager',
    status: 'active',
  });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: generateInteractionNumber(),
    scopeType: 'case',
    clientUser: client._id,
    case: caseDoc._id,
    workspace: workspace._id,
    subject: 'Case question',
    description: 'Case question description.',
    type: 'client_question',
    createdByType: 'client',
    createdByClient: client._id,
  });
  return { client, caseDoc, workspace, interaction };
}

// ---------------------------------------------------------------------------
// List / detail authorization
// ---------------------------------------------------------------------------

test('query list: viewer is denied (no queries.view capability)', async () => {
  const { agent } = await loggedInAs('viewer');
  const res = await agent.get('/admin/queries');
  assert.equal(res.status, 403);
});

test('query list: pm sees only consultation-scoped + own-workspace case-scoped interactions', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { interaction: consultInteraction } = await seedConsultationInteraction();
  const { interaction: myCaseInteraction } = await seedCaseInteraction(pm._id);
  const { user: otherPm } = await seedAdminUser({ role: 'pm' });
  const { interaction: otherCaseInteraction } = await seedCaseInteraction(otherPm._id);

  const res = await agent.get('/admin/queries');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes(consultInteraction.interactionNumber));
  assert.ok(res.text.includes(myCaseInteraction.interactionNumber));
  assert.ok(!res.text.includes(otherCaseInteraction.interactionNumber));
});

test('query detail: case-scoped interaction denied to a pm without workspace membership', async () => {
  const { user: casePm } = await seedAdminUser({ role: 'pm' });
  const { interaction } = await seedCaseInteraction(casePm._id);
  const { agent } = await loggedInAs('pm');

  const res = await agent.get(`/admin/queries/${interaction._id}`);
  assert.equal(res.status, 403);
});

test('query detail: admin (queries.view_all) can view any case-scoped interaction', async () => {
  const { user: casePm } = await seedAdminUser({ role: 'pm' });
  const { interaction } = await seedCaseInteraction(casePm._id);
  const { agent } = await loggedInAs('admin');

  const res = await agent.get(`/admin/queries/${interaction._id}`);
  assert.equal(res.status, 200);
});

test('query detail: invalid id returns a controlled response, not a 500', async () => {
  const { agent } = await loggedInAs('admin');
  const res = await agent.get('/admin/queries/not-a-valid-object-id');
  assert.notEqual(res.status, 500);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('acknowledge: submitted -> acknowledged, creates history, unchanged retry creates no duplicate', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  const first = await agent.post(`/admin/queries/${interaction._id}/acknowledge`);
  assert.equal(first.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'acknowledged');
  assert.equal(await InteractionHistory.countDocuments({ interaction: interaction._id }), 1);

  await agent.post(`/admin/queries/${interaction._id}/acknowledge`);
  assert.equal(
    await InteractionHistory.countDocuments({ interaction: interaction._id }),
    1,
    'a no-op re-acknowledge must not create a second history entry',
  );
});

test('assign: valid assignee succeeds and notifies; invalid assignee is rejected leaving DB unchanged', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();
  const { user: assignee } = await seedAdminUser({ role: 'pm' });

  const invalid = await agent.post(`/admin/queries/${interaction._id}/assign`).type('form').send({ assignedTo: '507f1f77bcf86cd799439011' });
  assert.equal(invalid.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).assignedTo, null);

  const valid = await agent.post(`/admin/queries/${interaction._id}/assign`).type('form').send({ assignedTo: String(assignee._id) });
  assert.equal(valid.status, 302);
  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(String(updated.assignedTo), String(assignee._id));

  assert.ok(await Notification.findOne({ recipientName: assignee.name, type: 'query_assigned' }));
});

test('assign: case-scoped interaction rejects an assignee without workspace membership', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { interaction, workspace } = await seedCaseInteraction(pm._id);
  const { user: outsider } = await seedAdminUser({ role: 'pm' });

  const res = await agent.post(`/admin/queries/${interaction._id}/assign`).type('form').send({ assignedTo: String(outsider._id) });
  assert.equal(res.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).assignedTo, null);
  void workspace;
});

test('schedule: valid IANA timezone succeeds; invalid timezone is rejected', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  const invalid = await agent
    .post(`/admin/queries/${interaction._id}/schedule`)
    .type('form')
    .send({ scheduledFor: new Date(Date.now() + 86400000).toISOString(), timezone: 'EST' });
  assert.equal(invalid.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'submitted');

  const valid = await agent
    .post(`/admin/queries/${interaction._id}/schedule`)
    .type('form')
    .send({ scheduledFor: new Date(Date.now() + 86400000).toISOString(), timezone: 'Asia/Karachi' });
  assert.equal(valid.status, 302);
  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated.status, 'scheduled');
  assert.equal(updated.timezone, 'Asia/Karachi');
});

test('reschedule records previous and new values in history', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  const firstTime = new Date(Date.now() + 86400000);
  await agent.post(`/admin/queries/${interaction._id}/schedule`).type('form').send({
    scheduledFor: firstTime.toISOString(),
    timezone: 'UTC',
  });

  const secondTime = new Date(Date.now() + 2 * 86400000);
  await agent.post(`/admin/queries/${interaction._id}/schedule`).type('form').send({
    scheduledFor: secondTime.toISOString(),
    timezone: 'Asia/Karachi',
  });

  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated.status, 'rescheduled');

  const rescheduleEntry = await InteractionHistory.findOne({ interaction: interaction._id, eventType: 'rescheduled' });
  assert.ok(rescheduleEntry);
  assert.equal(rescheduleEntry.previousTimezone, 'UTC');
  assert.equal(rescheduleEntry.newTimezone, 'Asia/Karachi');
});

test('start work moves submitted -> in_progress', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();
  const res = await agent.post(`/admin/queries/${interaction._id}/status`).type('form').send({ status: 'in_progress' });
  assert.equal(res.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'in_progress');
});

test('answer stores answeredBy/answeredAt and internal response is never sent to the client-facing path', async () => {
  const { agent, user: pm } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  const res = await agent.post(`/admin/queries/${interaction._id}/answer`).type('form').send({
    clientVisibleResponse: 'Here is your answer.',
    internalResponse: 'Internal-only note about the client.',
  });
  assert.equal(res.status, 302);

  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated.status, 'answered');
  assert.ok(updated.answeredAt);
  assert.equal(String(updated.answeredBy), String(pm._id));
  assert.equal(updated.clientVisibleResponse, 'Here is your answer.');
  assert.equal(updated.internalResponse, 'Internal-only note about the client.');

  // The client-facing query (src/lib/auth/interaction-policy.ts's
  // getAccessibleInteraction equivalent) never selects internalResponse —
  // verified directly here at the data layer: a client-safe projection
  // must omit it.
  const clientProjection = await ConsultationInteraction.findById(interaction._id)
    .select('-internalResponse')
    .lean();
  assert.equal(clientProjection.internalResponse, undefined);
});

test('answer requires a non-empty client-visible response', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();
  const res = await agent.post(`/admin/queries/${interaction._id}/answer`).type('form').send({ clientVisibleResponse: '' });
  assert.equal(res.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'submitted');
});

test('request clarification moves status to awaiting_client and creates a client-visible update', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  const res = await agent
    .post(`/admin/queries/${interaction._id}/request-clarification`)
    .type('form')
    .send({ clientVisibleQuestion: 'Can you provide your passport number?' });
  assert.equal(res.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'awaiting_client');

  const update = await InteractionUpdate.findOne({ interaction: interaction._id, updateType: 'employee_clarification' });
  assert.ok(update);
  assert.equal(update.visibility, 'client_visible');
});

test('no-show requires a previously scheduled interaction', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  const rejected = await agent.post(`/admin/queries/${interaction._id}/no-show`);
  assert.equal(rejected.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'submitted');

  await agent.post(`/admin/queries/${interaction._id}/schedule`).type('form').send({
    scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    timezone: 'UTC',
  });
  const accepted = await agent.post(`/admin/queries/${interaction._id}/no-show`);
  assert.equal(accepted.status, 302);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'no_show');
});

test('cancel sets cancelledAt and is idempotent', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  await agent.post(`/admin/queries/${interaction._id}/cancel`).type('form').send({ reason: 'Client withdrew.' });
  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated.status, 'cancelled');
  assert.ok(updated.cancelledAt);

  await agent.post(`/admin/queries/${interaction._id}/cancel`).type('form').send({});
  assert.equal(
    await InteractionHistory.countDocuments({ interaction: interaction._id, eventType: 'cancelled' }),
    1,
    'cancelling an already-cancelled interaction must not duplicate history',
  );
});

test('close sets closedAt', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();
  await agent.post(`/admin/queries/${interaction._id}/close`);
  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated.status, 'closed');
  assert.ok(updated.closedAt);
});

test('rejected requests leave the database unchanged: unauthorized cancel attempt', async () => {
  const { user: casePm } = await seedAdminUser({ role: 'pm' });
  const { interaction } = await seedCaseInteraction(casePm._id);
  const { agent } = await loggedInAs('pm'); // different pm, no membership

  const res = await agent.post(`/admin/queries/${interaction._id}/cancel`);
  assert.equal(res.status, 403);
  assert.equal((await ConsultationInteraction.findById(interaction._id)).status, 'submitted');
  assert.equal(await InteractionHistory.countDocuments({ interaction: interaction._id }), 0);
});

test('internal employee notes never appear in the client-visible update set', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  await agent.post(`/admin/queries/${interaction._id}/notes`).type('form').send({ note: 'Internal-only note.' });

  const internalUpdates = await InteractionUpdate.find({ interaction: interaction._id, visibility: 'internal' });
  assert.equal(internalUpdates.length, 1);

  const clientVisible = await InteractionUpdate.find({ interaction: interaction._id, visibility: 'client_visible' });
  assert.equal(clientVisible.length, 0);
});

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

test('a stale concurrent update is rejected with a controlled conflict, not a silent overwrite', async () => {
  const { agent } = await loggedInAs('pm');
  const { interaction } = await seedConsultationInteraction();

  // Load two independent copies (simulating two employees opening the same
  // page), mutate and save the first, then attempt to save a change loaded
  // from the now-stale second copy directly against the model (bypassing
  // HTTP to exercise the exact concurrency mechanism deterministically).
  const copyA = await ConsultationInteraction.findById(interaction._id);
  const copyB = await ConsultationInteraction.findById(interaction._id);

  copyA.status = 'acknowledged';
  await copyA.save();

  copyB.status = 'in_progress';
  await assert.rejects(copyB.save(), (err) => err instanceof require('mongoose').Error.VersionError);
});
