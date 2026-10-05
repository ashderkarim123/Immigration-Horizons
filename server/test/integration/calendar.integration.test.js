/**
 * Staff calendar through the real Express app and a real MongoDB (ADR-027): the projection of real source models,
 * authorization and concealment, timezone semantics, and manual event lifecycle. Nothing here is mocked: every
 * date is a row in the module that owns it.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
delete process.env.PRACTICE_TIME_ZONE;

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const CaseActivity = require('../../models/CaseActivity');
const CaseCalendarEvent = require('../../models/CaseCalendarEvent');
const Task = require('../../models/admin/Task');
const DocumentCategory = require('../../models/DocumentCategory');
const DocumentRequest = require('../../models/DocumentRequest');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const USCISFiling = require('../../models/USCISFiling');
const NotificationPreference = require('../../models/admin/NotificationPreference');
const { CAPABILITIES } = require('../../utils/permissions');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const RANGE = 'from=2026-10-01&to=2026-10-31';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;
const day = (s) => new Date(`${s}T00:00:00.000Z`);

test.before(async () => {
  await startTestDb();
  await Promise.all([CaseCalendarEvent.init(), DocumentRequest.init()]);
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

// ─── fixtures ────────────────────────────────────────────────────────────────

async function staffAgent(role, { workspace = null, workspaceRole = 'contributor' } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  const member = workspace ? await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole, status: 'active' }) : null;
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD })).status, 200);
  return { agent, user, member };
}

async function seedCase(title = 'Alpha petition') {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', lastName: 'Client', status: 'active' });
  const owner = await AdminUser.create({ name: 'Case Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title,
    caseType: 'other',
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  const clientMember = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  return { caseDoc, workspace, client, owner, clientMember };
}

/**
 * Two cases. Team A: pm, evidence_collector (no queries/USCIS access), uscis_forms_specialist. Team B: its own pm.
 * Every date below is a real source row inside October 2026.
 */
async function seedWorld() {
  const a = await seedCase('Alpha petition');
  const b = await seedCase('Beta petition');
  const pm = await staffAgent('pm', { workspace: a.workspace, workspaceRole: 'project_manager' });
  const collector = await staffAgent('evidence_collector', { workspace: a.workspace });
  const uscisSpecialist = await staffAgent('uscis_forms_specialist', { workspace: a.workspace });
  const outsider = await staffAgent('pm', { workspace: b.workspace, workspaceRole: 'project_manager' });
  const admin = await staffAgent('admin');
  const viewer = await staffAgent('viewer');

  await ClientCase.updateOne({ _id: a.caseDoc._id }, { targetFilingDate: day('2026-10-15') });
  await ClientCase.updateOne({ _id: b.caseDoc._id }, { targetFilingDate: day('2026-10-16') });

  const taskA = await Task.create({ case: a.caseDoc._id, title: 'Draft cover letter', assignee: pm.user._id, assigneeName: 'pm', dueDate: day('2026-10-20'), priority: 'high' });
  const taskCollector = await Task.create({ case: a.caseDoc._id, title: 'Collect evidence', assignee: collector.user._id, dueDate: day('2026-10-21') });
  const taskB = await Task.create({ case: b.caseDoc._id, title: 'Beta task', assignee: outsider.user._id, dueDate: day('2026-10-22') });

  const category = await DocumentCategory.create({ case: a.caseDoc._id, workspace: a.workspace._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  const doc = await DocumentRequest.create({ case: a.caseDoc._id, workspace: a.workspace._id, category: category._id, title: 'Passport copy', requestedFrom: a.clientMember._id, requestedBy: pm.user._id, dueDate: day('2026-10-22') });

  const appt = await ConsultationInteraction.create({
    interactionNumber: unique('INT'), scopeType: 'case', clientUser: a.client._id, case: a.caseDoc._id, workspace: a.workspace._id,
    subject: 'Strategy call', description: 'd', type: 'scheduled_consultation', status: 'scheduled',
    scheduledFor: new Date('2026-10-18T18:30:00.000Z'), timezone: 'America/New_York', responseDueAt: day('2026-10-25'), assignedTo: pm.user._id, createdByType: 'admin',
  });

  const filing = await USCISFiling.create({ case: a.caseDoc._id, workspace: a.workspace._id, title: 'I-140', formType: 'I-140', actionRequired: true, responseDueAt: day('2026-10-27') });

  return { a, b, pm, collector, uscisSpecialist, outsider, admin, viewer, taskA, taskCollector, taskB, doc, appt, filing };
}

const get = (agent, qs = RANGE) => agent.get(`/api/v1/staff/calendar?${qs}`);
const ids = (res) => res.body.data.items.map((i) => i.id);
const kindsOf = (res) => [...new Set(res.body.data.items.map((i) => i.kind))].sort();
const post = (agent, url, body) => agent.post(url).set('Origin', ORIGIN).send(body);
const patch = (agent, url, body) => agent.patch(url).set('Origin', ORIGIN).send(body);

// ─── projection of real sources ──────────────────────────────────────────────

test('the calendar projects every real source and stores no calendar row of its own', async () => {
  const w = await seedWorld();
  const res = await get(w.pm.agent, `${RANGE}&scope=team`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(new Set(ids(res)), new Set([
    `case:${w.a.caseDoc._id}:targetFilingDate`,
    `task:${w.taskA._id}:dueDate`,
    `task:${w.taskCollector._id}:dueDate`,
    `document_request:${w.doc._id}:dueDate`,
    `query:${w.appt._id}:scheduledFor`,
    `query:${w.appt._id}:responseDueAt`,
    `uscis:${w.filing._id}:responseDueAt`,
  ]));
  assert.equal(await CaseCalendarEvent.countDocuments(), 0, 'no duplicate calendar record is created for these sources');

  const task = res.body.data.items.find((i) => i.sourceType === 'task' && i.sourceId === String(w.taskA._id));
  assert.deepEqual([task.kind, task.title, task.priority, task.person, task.case.caseNumber === w.a.caseDoc.caseNumber], ['task_due', 'Draft cover letter', 'high', 'Staff pm', true]);
  assert.deepEqual(task.link, { path: `/cases/${w.a.caseDoc._id}`, queryParams: { tab: 'tasks' } });
  for (const hidden of ['_id', '__v', 'workspace']) assert.equal(task[hidden], undefined, hidden);
  assert.deepEqual(res.body.data.range, { from: '2026-10-01', to: '2026-10-31', timeZone: 'UTC' });
  assert.equal(res.body.data.truncated, false);
});

test('items are ordered by day then time, and a range outside the dates returns nothing', async () => {
  const w = await seedWorld();
  const res = await get(w.pm.agent, `${RANGE}&scope=team`);
  const dates = res.body.data.items.map((i) => i.time.date || i.time.startAt.slice(0, 10));
  assert.deepEqual(dates, [...dates].sort());
  assert.deepEqual(ids(await get(w.pm.agent, 'from=2026-11-01&to=2026-11-30&scope=team')), []);
});

// ─── time semantics ──────────────────────────────────────────────────────────

test('date-only deadlines keep their calendar day in every zone; the appointment is the same instant rendered in its own zone', async () => {
  const w = await seedWorld();
  for (const timeZone of ['UTC', 'America/New_York', 'Asia/Karachi', 'Asia/Tokyo']) {
    const res = await get(w.pm.agent, `${RANGE}&scope=team&timeZone=${encodeURIComponent(timeZone)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.range.timeZone, timeZone);
    const task = res.body.data.items.find((i) => i.id === `task:${w.taskA._id}:dueDate`);
    assert.deepEqual([task.time.mode, task.time.date, task.time.startAt], ['date', '2026-10-20', null], timeZone);
    const appt = res.body.data.items.find((i) => i.id === `query:${w.appt._id}:scheduledFor`);
    assert.deepEqual([appt.time.mode, appt.time.startAt, appt.time.timeZone], ['datetime', '2026-10-18T18:30:00.000Z', 'America/New_York']);
  }
});

test('a range boundary uses the viewer zone for timed items: an evening appointment falls on the next UTC day', async () => {
  const w = await seedWorld();
  // 2026-10-18T18:30Z is 2026-10-19 03:30 in Tokyo, so a Tokyo viewer asking only for the 18th does not get it.
  assert.ok(ids(await get(w.pm.agent, 'from=2026-10-18&to=2026-10-18&scope=team&timeZone=UTC')).includes(`query:${w.appt._id}:scheduledFor`));
  assert.ok(!ids(await get(w.pm.agent, 'from=2026-10-18&to=2026-10-18&scope=team&timeZone=Asia/Tokyo')).includes(`query:${w.appt._id}:scheduledFor`));
  assert.ok(ids(await get(w.pm.agent, 'from=2026-10-19&to=2026-10-19&scope=team&timeZone=Asia/Tokyo')).includes(`query:${w.appt._id}:scheduledFor`));
});

test('the resolved zone is the employee zone, then the practice zone, then UTC; invalid zones are refused', async () => {
  const w = await seedWorld();
  const cfg = async () => (await w.pm.agent.get('/api/v1/staff/calendar/config')).body.data.timeZone;
  assert.deepEqual(await cfg(), { resolved: 'UTC', source: 'utc', userValue: null, practice: { value: null, configured: false, invalid: false } });

  process.env.PRACTICE_TIME_ZONE = 'America/New_York';
  try {
    assert.deepEqual([(await cfg()).resolved, (await cfg()).source], ['America/New_York', 'practice']);
    const saved = await patch(w.pm.agent, '/api/v1/staff/calendar/preferences', { timeZone: 'Asia/Karachi' });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual([saved.body.data.timeZone.resolved, saved.body.data.timeZone.source, saved.body.data.timeZone.userValue], ['Asia/Karachi', 'user', 'Asia/Karachi']);
    assert.equal((await get(w.pm.agent, `${RANGE}&scope=team`)).body.data.range.timeZone, 'Asia/Karachi', 'the saved zone is the default for queries');
    assert.equal((await w.pm.agent.get('/api/v1/staff/me')).body.data.timeZone.resolved, 'Asia/Karachi');
    assert.equal((await patch(w.pm.agent, '/api/v1/staff/calendar/preferences', { timeZone: '' })).body.data.timeZone.source, 'practice', 'clearing falls back to the practice zone');
  } finally {
    delete process.env.PRACTICE_TIME_ZONE;
  }

  for (const bad of ['EST', 'GMT+5', 'Mars/Olympus', 'new york']) {
    const res = await patch(w.pm.agent, '/api/v1/staff/calendar/preferences', { timeZone: bad });
    assert.equal(res.status, 422, bad);
    assert.equal(res.body.error.fieldErrors[0].field, 'timeZone');
  }
  assert.equal((await get(w.pm.agent, `${RANGE}&timeZone=EST`)).status, 422);
});

test('the range is required, validated and bounded; filters are validated', async () => {
  const w = await seedWorld();
  for (const qs of ['', 'from=2026-10-01', 'from=2026-10-01&to=2026-13-40', 'from=2026-10-31&to=2026-10-01', 'from=2026-01-01&to=2026-12-31', 'from=2000-01-01&to=2030-01-01']) {
    assert.equal((await get(w.pm.agent, qs)).status, 422, qs);
  }
  assert.equal((await get(w.pm.agent, 'from=2026-01-01&to=2026-04-03')).status, 200, 'exactly 93 days is allowed');
  assert.equal((await get(w.pm.agent, `${RANGE}&scope=everyone`)).status, 422);
  assert.equal((await get(w.pm.agent, `${RANGE}&kinds=task_due,bogus`)).status, 422);
  assert.equal((await get(w.pm.agent, `${RANGE}&assignee=nope`)).status, 422);
});

// ─── authorization ───────────────────────────────────────────────────────────

test('unauthenticated requests, a client cookie, and employees without calendar.view are all denied', async () => {
  const w = await seedWorld();
  assert.equal((await request(app).get(`/api/v1/staff/calendar?${RANGE}`)).status, 401);
  assert.equal((await request(app).get(`/api/v1/staff/calendar?${RANGE}`).set('Cookie', 'ih_client_session=abc; next-auth.session-token=abc')).status, 401);
  assert.equal((await get(w.viewer.agent)).status, 403);
  assert.equal((await w.viewer.agent.get('/api/v1/staff/calendar/config')).status, 403);
});

test('a specialist sees only their assigned case, other teams’ dates are absent, and sources without the capability are not queried', async () => {
  const w = await seedWorld();
  const res = await get(w.collector.agent, `${RANGE}&scope=team`);
  assert.equal(res.status, 200);
  const got = new Set(ids(res));
  assert.ok(got.has(`case:${w.a.caseDoc._id}:targetFilingDate`) && got.has(`document_request:${w.doc._id}:dueDate`));
  assert.ok(!got.has(`case:${w.b.caseDoc._id}:targetFilingDate`) && !got.has(`task:${w.taskB._id}:dueDate`), 'the other team is absent');
  assert.ok(!got.has(`task:${w.taskA._id}:dueDate`), 'no tasks.view_all: only their own tasks');
  assert.ok(got.has(`task:${w.taskCollector._id}:dueDate`));
  assert.deepEqual(kindsOf(res), ['document_due', 'target_filing', 'task_due']);
  assert.deepEqual(res.body.data.kinds.sort(), ['document_due', 'manual_event', 'target_filing', 'task_due'], 'no queries.view or uscis_tracking.view: those sources are absent');
  // Asking for them explicitly changes nothing.
  assert.deepEqual(ids(await get(w.collector.agent, `${RANGE}&scope=team&kinds=uscis_response,appointment,query_due`)), []);
  // USCIS is visible to a role that has the capability.
  assert.ok(ids(await get(w.uscisSpecialist.agent, `${RANGE}&scope=team`)).includes(`uscis:${w.filing._id}:responseDueAt`));
});

test('the document source is hidden when the actor lacks documents.view, whatever else they hold', async () => {
  const w = await seedWorld();
  const original = CAPABILITIES['documents.view'];
  CAPABILITIES['documents.view'] = original.filter((r) => r !== 'evidence_collector');
  try {
    const res = await get(w.collector.agent, `${RANGE}&scope=team`);
    assert.ok(!ids(res).includes(`document_request:${w.doc._id}:dueDate`));
    assert.ok(!res.body.data.kinds.includes('document_due'));
  } finally {
    CAPABILITIES['documents.view'] = original;
  }
});

test('cases.view_all sees the firm in team scope but only their own cases in "mine"', async () => {
  const w = await seedWorld();
  const team = ids(await get(w.admin.agent, `${RANGE}&scope=team`));
  for (const id of [`case:${w.a.caseDoc._id}:targetFilingDate`, `case:${w.b.caseDoc._id}:targetFilingDate`, `task:${w.taskB._id}:dueDate`, `document_request:${w.doc._id}:dueDate`]) assert.ok(team.includes(id), id);
  assert.deepEqual(ids(await get(w.admin.agent, `${RANGE}&scope=mine`)), [], 'an admin who is on no case and owns no task has an empty personal calendar');
  assert.ok(ids(await get(w.pm.agent, `${RANGE}&scope=mine`)).includes(`task:${w.taskA._id}:dueDate`));
  assert.ok(!ids(await get(w.pm.agent, `${RANGE}&scope=mine`)).includes(`task:${w.taskCollector._id}:dueDate`));
});

test('a case filter is honoured only for a case the actor can see; otherwise it is the one 404', async () => {
  const w = await seedWorld();
  const mine = await get(w.pm.agent, `${RANGE}&scope=team&caseId=${w.a.caseDoc._id}`);
  assert.equal(mine.status, 200);
  assert.ok(mine.body.data.items.every((i) => i.case.id === String(w.a.caseDoc._id)));
  assert.equal((await get(w.outsider.agent, `${RANGE}&scope=team&caseId=${w.a.caseDoc._id}`)).status, 404);
  assert.equal((await get(w.pm.agent, `${RANGE}&caseId=not-an-id`)).status, 404);
  assert.equal((await get(w.pm.agent, `${RANGE}&caseId=${new (require('mongoose').Types.ObjectId)()}`)).status, 404);
  assert.equal((await get(w.admin.agent, `${RANGE}&scope=team&caseId=${w.b.caseDoc._id}`)).status, 200);
});

test('a removed member loses the case dates on the very next request', async () => {
  const w = await seedWorld();
  assert.ok(ids(await get(w.collector.agent, `${RANGE}&scope=team`)).includes(`case:${w.a.caseDoc._id}:targetFilingDate`));
  await WorkspaceMember.updateOne({ _id: w.collector.member._id }, { status: 'removed' });
  const after = await get(w.collector.agent, `${RANGE}&scope=team`);
  assert.ok(!ids(after).some((id) => id.includes(String(w.a.caseDoc._id)) || id.includes(String(w.doc._id))));
  assert.equal((await get(w.collector.agent, `${RANGE}&scope=team&caseId=${w.a.caseDoc._id}`)).status, 404);
});

test('completed work and cancelled/archived sources are hidden unless explicitly included', async () => {
  const w = await seedWorld();
  await Task.updateOne({ _id: w.taskA._id }, { status: 'completed', completedAt: new Date() });
  await DocumentRequest.updateOne({ _id: w.doc._id }, { status: 'cancelled', cancelledAt: new Date() });
  await USCISFiling.updateOne({ _id: w.filing._id }, { actionRequired: false });
  await ConsultationInteraction.updateOne({ _id: w.appt._id }, { status: 'cancelled', cancelledAt: new Date() });
  const hidden = ids(await get(w.pm.agent, `${RANGE}&scope=team`));
  for (const id of [`task:${w.taskA._id}:dueDate`, `document_request:${w.doc._id}:dueDate`, `uscis:${w.filing._id}:responseDueAt`, `query:${w.appt._id}:scheduledFor`, `query:${w.appt._id}:responseDueAt`]) assert.ok(!hidden.includes(id), id);
  const shown = ids(await get(w.pm.agent, `${RANGE}&scope=team&includeCompleted=true`));
  for (const id of [`task:${w.taskA._id}:dueDate`, `document_request:${w.doc._id}:dueDate`, `query:${w.appt._id}:scheduledFor`]) assert.ok(shown.includes(id), id);
  assert.ok(!shown.includes(`uscis:${w.filing._id}:responseDueAt`), 'USCIS appears only while action is required');

  await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { archivedAt: new Date() });
  assert.ok(!ids(await get(w.pm.agent, `${RANGE}&scope=team`)).includes(`case:${w.a.caseDoc._id}:targetFilingDate`), 'archived cases have no target filing date');
});

// ─── manual events ───────────────────────────────────────────────────────────

const eventsUrl = (c) => `/api/v1/staff/cases/${c._id}/calendar-events`;
const timed = (over = {}) => ({ eventType: 'appointment', title: 'Client interview prep', description: 'Internal prep notes', allDay: false, startLocal: '2026-10-20T14:30', endLocal: '2026-10-20T15:30', timeZone: 'America/New_York', location: 'Room 2', meetingUrl: 'https://meet.example.com/abc', attendeeIds: [], clientVisible: false, clientTitle: '', clientDescription: '', ...over });

test('create: a timed event converts wall-clock to the exact instant, returns an editor-ready DTO, appears in the calendar and writes a safe activity', async () => {
  const w = await seedWorld();
  const res = await post(w.pm.agent, eventsUrl(w.a.caseDoc), timed({ attendeeIds: [String(w.collector.user._id)] }));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const e = res.body.data;
  assert.deepEqual([e.startAt, e.endAt, e.startLocal, e.endLocal, e.timeZone, e.status], ['2026-10-20T18:30:00.000Z', '2026-10-20T19:30:00.000Z', '2026-10-20T14:30', '2026-10-20T15:30', 'America/New_York', 'scheduled']);
  assert.deepEqual(e.attendees, [{ id: String(w.collector.user._id), name: 'Staff evidence_collector' }]);
  assert.deepEqual(e.actions, { canEdit: true, canCancel: true });
  for (const hidden of ['_id', '__v', 'workspace', 'createdBy', 'internalTitle']) assert.equal(e[hidden], undefined, hidden);

  const item = (await get(w.pm.agent, `${RANGE}&scope=team&timeZone=Asia/Tokyo`)).body.data.items.find((i) => i.id === `manual_event:${e.id}`);
  assert.deepEqual([item.kind, item.title, item.time.mode, item.time.startAt, item.time.timeZone, item.actions.canEdit], ['manual_event', 'Client interview prep', 'datetime', '2026-10-20T18:30:00.000Z', 'America/New_York', true]);
  assert.deepEqual(item.link, { path: `/cases/${w.a.caseDoc._id}`, queryParams: { tab: 'calendar', event: e.id } });

  const activity = await CaseActivity.find({ case: w.a.caseDoc._id, type: 'calendar_event_created' }).lean();
  assert.equal(activity.length, 1);
  for (const secret of ['Client interview prep', 'Internal prep notes', 'meet.example.com', 'Room 2']) assert.ok(!activity[0].message.includes(secret), `activity must not contain "${secret}"`);
  // The attendee sees it in their personal calendar; a non-attendee member does not.
  assert.ok(ids(await get(w.collector.agent, `${RANGE}&scope=mine`)).includes(`manual_event:${e.id}`));
  assert.ok(!ids(await get(w.uscisSpecialist.agent, `${RANGE}&scope=mine`)).includes(`manual_event:${e.id}`));
});

test('an all-day event never shifts its day, whichever zone the viewer is in, and spans multiple days', async () => {
  const w = await seedWorld();
  const res = await post(w.pm.agent, eventsUrl(w.a.caseDoc), { eventType: 'milestone', title: 'Filing window', allDay: true, startDate: '2026-10-31', endDate: '2026-11-02', clientVisible: false });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.startDate, res.body.data.endDate, res.body.data.startAt, res.body.data.timeZone], ['2026-10-31', '2026-11-02', null, null]);
  for (const timeZone of ['UTC', 'America/New_York', 'Asia/Karachi', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    const item = (await get(w.pm.agent, `from=2026-10-31&to=2026-10-31&scope=team&timeZone=${encodeURIComponent(timeZone)}`)).body.data.items.find((i) => i.kind === 'manual_event');
    assert.deepEqual([item.time.mode, item.time.date, item.time.endDate, item.time.allDay], ['date', '2026-10-31', '2026-11-02', true], timeZone);
  }
  assert.ok(ids(await get(w.pm.agent, 'from=2026-11-02&to=2026-11-02&scope=team')).some((i) => i.startsWith('manual_event:')), 'a multi-day event appears on its last day');
  assert.ok(!ids(await get(w.pm.agent, 'from=2026-11-03&to=2026-11-03&scope=team')).some((i) => i.startsWith('manual_event:')));
});

test('create requires calendar.manage and case access; a specialist cannot, an outsider gets the concealed 404', async () => {
  const w = await seedWorld();
  assert.equal((await post(w.collector.agent, eventsUrl(w.a.caseDoc), timed())).status, 403);
  assert.equal((await post(w.outsider.agent, eventsUrl(w.a.caseDoc), timed())).status, 404);
  assert.equal((await post(w.pm.agent, '/api/v1/staff/cases/not-an-id/calendar-events', timed())).status, 404);
  assert.equal((await request(app).post(eventsUrl(w.a.caseDoc)).send(timed())).status, 401);
  assert.equal((await w.pm.agent.post(eventsUrl(w.a.caseDoc)).set('Origin', 'https://evil.example').send(timed())).status, 403, 'untrusted origin');
  assert.equal(await CaseCalendarEvent.countDocuments(), 0);
});

test('validation: bad zone, unsafe link, unreadable time, end before start, missing client title and outsider attendees are all refused', async () => {
  const w = await seedWorld();
  const field = async (over) => {
    const res = await post(w.pm.agent, eventsUrl(w.a.caseDoc), timed(over));
    assert.equal(res.status, 422, JSON.stringify(over));
    return res.body.error.fieldErrors.map((f) => f.field);
  };
  assert.deepEqual(await field({ timeZone: 'EST' }), ['timeZone']);
  assert.deepEqual(await field({ timeZone: '' }), ['timeZone']);
  assert.deepEqual(await field({ meetingUrl: 'http://insecure.example.com' }), ['meetingUrl']);
  assert.deepEqual(await field({ meetingUrl: 'javascript:alert(1)' }), ['meetingUrl']);
  assert.deepEqual(await field({ startLocal: '2026-10-20' }), ['startLocal']);
  assert.deepEqual(await field({ startLocal: '2026-13-40T10:00' }), ['startLocal']);
  assert.deepEqual(await field({ endLocal: '2026-10-20T13:00' }), ['endLocal']);
  assert.deepEqual(await field({ title: '   ' }), ['title']);
  assert.deepEqual(await field({ eventType: 'party' }), ['eventType']);
  assert.deepEqual(await field({ clientVisible: true, clientTitle: '' }), ['clientTitle']);
  assert.deepEqual(await field({ title: 'x'.repeat(201) }), ['title']);
  assert.deepEqual(await field({ attendeeIds: [String(w.outsider.user._id)] }), ['attendeeIds'], 'an employee on another team cannot be invited');
  assert.deepEqual(await field({ attendeeIds: ['nope'] }), ['attendeeIds']);
  assert.deepEqual(await field({ allDay: true, startDate: '' }), ['startDate']);
  assert.deepEqual(await field({ allDay: true, startDate: '2026-10-20', endDate: '2026-10-19' }), ['endDate']);
  // A deactivated team member is not a valid attendee either.
  await AdminUser.updateOne({ _id: w.collector.user._id }, { isActive: false });
  assert.deepEqual(await field({ attendeeIds: [String(w.collector.user._id)] }), ['attendeeIds']);
  assert.equal(await CaseCalendarEvent.countDocuments(), 0);
});

test('read and edit: the editor round-trips, switching all-day and timed leaves no stale fields, and every change is audited safely', async () => {
  const w = await seedWorld();
  const created = (await post(w.pm.agent, eventsUrl(w.a.caseDoc), timed())).body.data;
  const url = `/api/v1/staff/calendar-events/${created.id}`;

  const read = await w.collector.agent.get(url);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.data.actions, { canEdit: false, canCancel: false }, 'a specialist can read but not change');
  assert.equal((await patch(w.collector.agent, url, { title: 'nope' })).status, 403);

  const moved = await patch(w.pm.agent, url, { startLocal: '2026-10-21T09:00', endLocal: '2026-10-21T10:00', title: 'Moved prep' });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual([moved.body.data.startAt, moved.body.data.startLocal, moved.body.data.title, moved.body.data.location], ['2026-10-21T13:00:00.000Z', '2026-10-21T09:00', 'Moved prep', 'Room 2']);

  const allDay = await patch(w.pm.agent, url, { allDay: true, startDate: '2026-10-22' });
  assert.equal(allDay.status, 200, JSON.stringify(allDay.body));
  assert.deepEqual([allDay.body.data.allDay, allDay.body.data.startDate, allDay.body.data.startAt, allDay.body.data.endAt, allDay.body.data.timeZone], [true, '2026-10-22', null, null, null]);
  const backToTimed = await patch(w.pm.agent, url, { allDay: false, startLocal: '2026-10-23T08:15', timeZone: 'Asia/Karachi' });
  assert.deepEqual([backToTimed.body.data.startAt, backToTimed.body.data.startDate], ['2026-10-23T03:15:00.000Z', null]);

  assert.equal((await patch(w.pm.agent, url, { meetingUrl: 'http://x.example.com' })).status, 422);
  assert.equal((await patch(w.pm.agent, url, { clientVisible: true })).status, 422, 'the merged result is validated as a whole');
  assert.equal((await patch(w.outsider.agent, url, { title: 'x' })).status, 404);
  assert.equal((await w.outsider.agent.get(url)).status, 404);
  assert.equal((await w.pm.agent.get('/api/v1/staff/calendar-events/not-an-id')).status, 404);

  const updates = await CaseActivity.find({ case: w.a.caseDoc._id, type: 'calendar_event_updated' }).lean();
  assert.equal(updates.length, 3);
  for (const a of updates) for (const secret of ['Moved prep', 'Internal prep notes', 'meet.example.com']) assert.ok(!a.message.includes(secret));
});

test('cancel is non-destructive and idempotent: the record stays, leaves the default calendar, and cannot be edited again', async () => {
  const w = await seedWorld();
  const created = (await post(w.pm.agent, eventsUrl(w.a.caseDoc), timed())).body.data;
  const url = `/api/v1/staff/calendar-events/${created.id}`;
  assert.equal((await w.collector.agent.post(`${url}/cancel`).set('Origin', ORIGIN).send({})).status, 403);

  const first = await post(w.pm.agent, `${url}/cancel`, {});
  assert.deepEqual([first.status, first.body.data.status, first.body.data.actions], [200, 'cancelled', { canEdit: false, canCancel: false }]);
  assert.equal((await post(w.pm.agent, `${url}/cancel`, {})).status, 200);
  assert.equal(await CaseActivity.countDocuments({ type: 'calendar_event_cancelled' }), 1, 'a repeat cancel writes no second activity');
  assert.equal(await CaseCalendarEvent.countDocuments(), 1, 'cancellation keeps the record');
  assert.ok(!ids(await get(w.pm.agent, `${RANGE}&scope=team`)).includes(`manual_event:${created.id}`));
  assert.ok(ids(await get(w.pm.agent, `${RANGE}&scope=team&includeCompleted=true`)).includes(`manual_event:${created.id}`));
  assert.equal((await patch(w.pm.agent, url, { title: 'revive' })).status, 409);
  assert.equal((await w.pm.agent.delete(url).set('Origin', ORIGIN)).status, 404, 'there is no delete route');
});

// ─── preferences & integration points ────────────────────────────────────────

test('reminder preferences default on, can be switched off per category, and nothing else changes', async () => {
  const w = await seedWorld();
  assert.deepEqual((await w.pm.agent.get('/api/v1/staff/calendar/config')).body.data.reminders, { deadlineReminders: true, appointmentReminders: true });
  const off = await patch(w.pm.agent, '/api/v1/staff/calendar/preferences', { deadlineReminders: false });
  assert.deepEqual(off.body.data.reminders, { deadlineReminders: false, appointmentReminders: true });
  const stored = await NotificationPreference.findOne({ recipientAdmin: w.pm.user._id }).lean();
  assert.deepEqual([stored.deadlineReminders, stored.appointmentReminders, stored.digestEmails], [false, true, true]);
  assert.equal((await patch(w.pm.agent, '/api/v1/staff/calendar/preferences', { deadlineReminders: 'no' })).status, 422);
  assert.equal((await patch(w.pm.agent, '/api/v1/staff/calendar/preferences', {})).status, 422);
  assert.equal((await w.pm.agent.patch('/api/v1/staff/calendar/preferences').set('Origin', 'https://evil.example').send({ timeZone: 'Asia/Tokyo' })).status, 403);
});

test('config lists only the sources the actor may see, and the case detail offers the Calendar tab only with calendar.view', async () => {
  const w = await seedWorld();
  const cfg = async (u) => (await u.agent.get('/api/v1/staff/calendar/config')).body.data;
  assert.deepEqual((await cfg(w.pm)).kinds.map((k) => k.value).sort(), ['appointment', 'document_due', 'manual_event', 'query_due', 'target_filing', 'task_due', 'uscis_response']);
  assert.deepEqual((await cfg(w.collector)).kinds.map((k) => k.value).sort(), ['document_due', 'manual_event', 'target_filing', 'task_due']);
  assert.deepEqual([(await cfg(w.pm)).canManage, (await cfg(w.collector)).canManage, (await cfg(w.pm)).maxRangeDays], [true, false, 93]);
  assert.ok((await w.pm.agent.get(`/api/v1/staff/cases/${w.a.caseDoc._id}`)).body.data.availableTabs.includes('calendar'));
});
