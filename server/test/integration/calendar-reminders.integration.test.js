/**
 * Calendar reminders against a real MongoDB (ADR-027). Every reminder comes from a real source row; "now" is injected so
 * the buckets are deterministic. Nothing here talks to production: the database is the disposable test instance.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const Task = require('../../models/admin/Task');
const DocumentCategory = require('../../models/DocumentCategory');
const DocumentRequest = require('../../models/DocumentRequest');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const USCISFiling = require('../../models/USCISFiling');
const USCISStatusEvent = require('../../models/USCISStatusEvent');
const CaseCalendarEvent = require('../../models/CaseCalendarEvent');
const Notification = require('../../models/admin/Notification');
const NotificationPreference = require('../../models/admin/NotificationPreference');
const { runReminders } = require('../../services/calendarReminderService');
const { run: runScript } = require('../../scripts/runCalendarReminders');

const NOW = new Date('2026-10-14T12:00:00.000Z');
const day = (s) => new Date(`${s}T00:00:00.000Z`);
let testUri;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  delete process.env.PRACTICE_TIME_ZONE;
  testUri = await startTestDb();
  await Notification.init();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

// ─── fixtures ────────────────────────────────────────────────────────────────

async function employee(role, workspace, { zone = '', workspaceRole = 'contributor', active = true } = {}) {
  const user = await AdminUser.create({ name: `Staff ${unique(role)}`, email: `${unique(role)}@ih.test`, password: 'Password123!', role, isActive: active, timeZone: zone });
  const member = workspace ? await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole, status: 'active' }) : null;
  return { user, member };
}

async function world() {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', lastName: 'Client', status: 'active' });
  const pmUser = await AdminUser.create({ name: 'Case PM', email: `${unique('pm')}@ih.test`, password: 'Password123!', role: 'pm' });
  const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: 'Alpha petition', caseType: 'other', primaryClient: client._id, projectManager: pmUser._id, createdBy: pmUser._id, createdByName: 'Case PM' });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: pmUser._id, createdByName: 'Case PM' });
  const clientMember = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  const pmMember = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: pmUser._id, workspaceRole: 'project_manager', status: 'active' });
  const staff = await employee('petition_writer', workspace);
  return { client, pmUser, pmMember, caseDoc, workspace, clientMember, staff };
}

const task = (w, due, over = {}) => Task.create({ case: w.caseDoc._id, title: `Task ${unique('t')}`, assignee: w.staff.user._id, dueDate: due ? day(due) : null, ...over });
const apply = (over = {}) => runReminders({ apply: true, now: NOW, ...over });
const notes = (filter = {}) => Notification.find(filter).sort({ createdAt: 1 }).lean();
const bucketOf = (n) => n.dedupeKey.split(':').pop();

// ─── buckets ─────────────────────────────────────────────────────────────────

test('task reminders: 7 days, tomorrow, today and overdue each produce one reminder; further out and long past produce none', async () => {
  const w = await world();
  const t7 = await task(w, '2026-10-21');
  const t8 = await task(w, '2026-10-22');
  const t5 = await task(w, '2026-10-19');
  const t1 = await task(w, '2026-10-15');
  const t0 = await task(w, '2026-10-14');
  const over = await task(w, '2026-10-12');
  const ancient = await task(w, '2026-09-20');
  await task(w, null);

  const result = await apply({ sources: ['task'] });
  assert.equal(result.totals.created, 5, JSON.stringify(result));
  const byTask = Object.fromEntries((await notes()).map((n) => [String(n.relatedTask), n]));
  assert.deepEqual(
    [t7, t5, t1, t0, over].map((t) => bucketOf(byTask[String(t._id)])),
    ['due_within_7_days', 'due_within_7_days', 'due_tomorrow', 'due_today', 'overdue'],
  );
  assert.equal(byTask[String(t8._id)], undefined);
  assert.equal(byTask[String(ancient._id)], undefined);

  const n = byTask[String(t1._id)];
  assert.deepEqual([n.type, n.recipientType, String(n.recipientAdmin), n.title, n.read, n.emailState], ['calendar_deadline_reminder', 'employee', String(w.staff.user._id), 'Task due tomorrow', false, 'not_applicable']);
  assert.match(n.message, /Case IH-2026-/);
  assert.match(n.message, /is due tomorrow \(2026-10-15\)/);
  assert.equal(n.dedupeKey, `calendar:task:${t1._id}:dueDate:2026-10-15:employee:${w.staff.user._id}:due_tomorrow`);
  assert.ok(!/@|Alpha|Casey/.test(n.dedupeKey), 'no PII in the key');
  assert.match(byTask[String(over._id)].message, /was due on 2026-10-12 and is overdue/);
});

test('buckets progress with time, an overdue reminder is sent once, and a rerun creates nothing', async () => {
  const w = await world();
  const t1 = await task(w, '2026-10-15');
  const over = await task(w, '2026-10-12');

  assert.equal((await apply({ sources: ['task'] })).totals.created, 2);
  const again = await apply({ sources: ['task'] });
  assert.deepEqual([again.totals.created, again.totals.alreadySent], [0, 2], 'a repeat run sends nothing');

  const tomorrow = await runReminders({ apply: true, now: new Date('2026-10-15T12:00:00Z'), sources: ['task'] });
  assert.equal(tomorrow.totals.created, 1, 'tomorrow became today: one new reminder; the overdue one is not repeated');
  assert.deepEqual((await notes({ relatedTask: t1._id })).map(bucketOf), ['due_tomorrow', 'due_today']);
  assert.equal((await notes({ relatedTask: over._id })).length, 1);
  assert.equal((await runReminders({ apply: true, now: new Date('2026-10-20T12:00:00Z'), sources: ['task'] })).totals.created, 1, 'only t1 became overdue; nothing else repeats');
});

test('a changed due date reminds again for the new date, and the old reminder stays as history', async () => {
  const w = await world();
  const t = await task(w, '2026-10-15');
  await apply({ sources: ['task'] });
  await Task.updateOne({ _id: t._id }, { dueDate: day('2026-10-17') });
  const result = await apply({ sources: ['task'] });
  assert.equal(result.totals.created, 1);
  const all = await notes({ relatedTask: t._id });
  assert.deepEqual(all.map((n) => n.dedupeKey.split(':')[4]), ['2026-10-15', '2026-10-17']);
  assert.deepEqual(all.map(bucketOf), ['due_tomorrow', 'due_within_7_days']);
});

test('appointments: 24 hours and 1 hour, for the assigned employee and the client; past and distant ones are not reminded', async () => {
  const w = await world();
  const pm = await employee('pm', w.workspace);
  const q = await ConsultationInteraction.create({
    interactionNumber: unique('INT'), scopeType: 'case', clientUser: w.client._id, case: w.caseDoc._id, workspace: w.workspace._id,
    subject: 'Strategy call', description: 'd', type: 'scheduled_consultation', status: 'scheduled',
    scheduledFor: new Date('2026-10-15T10:00:00Z'), timezone: 'America/New_York', assignedTo: pm.user._id, createdByType: 'admin',
  });

  assert.equal((await apply({ sources: ['query_appointment'] })).totals.created, 2);
  const first = await notes({ type: 'calendar_appointment_reminder' });
  assert.deepEqual(first.map(bucketOf), ['within_24_hours', 'within_24_hours']);
  assert.deepEqual(first.map((n) => n.recipientType).sort(), ['client', 'employee']);
  const staff = first.find((n) => n.recipientType === 'employee');
  assert.match(staff.message, /starts Thu, Oct 15 at 10:00 AM UTC/, 'rendered in the recipient zone (UTC here)');
  assert.deepEqual([String(staff.relatedInteraction), String(staff.relatedCase)], [String(q._id), String(w.caseDoc._id)]);

  const hour = await runReminders({ apply: true, now: new Date('2026-10-15T09:30:00Z'), sources: ['query_appointment'] });
  assert.equal(hour.totals.created, 2);
  assert.equal((await notes({ type: 'calendar_appointment_reminder' })).filter((n) => bucketOf(n) === 'within_1_hour').length, 2);
  assert.equal((await runReminders({ apply: true, now: new Date('2026-10-15T09:35:00Z'), sources: ['query_appointment'] })).totals.created, 0, 'still inside the hour: no repeat');
  assert.equal((await runReminders({ apply: true, now: new Date('2026-10-15T10:30:00Z'), sources: ['query_appointment'] })).totals.created, 0, 'past');
  assert.equal((await runReminders({ apply: true, now: new Date('2026-10-13T10:00:00Z'), sources: ['query_appointment'] })).totals.created, 0, 'more than a day away');

  // Rescheduling is a new instant, hence a new reminder.
  await ConsultationInteraction.updateOne({ _id: q._id }, { scheduledFor: new Date('2026-10-15T20:00:00Z'), status: 'rescheduled' });
  assert.equal((await runReminders({ apply: true, now: new Date('2026-10-15T12:00:00Z'), sources: ['query_appointment'] })).totals.created, 2);
});

test('query response dates remind the assigned employee only, and only while the query is open', async () => {
  const w = await world();
  const pm = await employee('pm', w.workspace);
  const make = (status, due) => ConsultationInteraction.create({ interactionNumber: unique('INT'), scopeType: 'case', clientUser: w.client._id, case: w.caseDoc._id, workspace: w.workspace._id, subject: 'Q', description: 'd', type: 'client_question', status, responseDueAt: day(due), assignedTo: pm.user._id, createdByType: 'client' });
  const open = await make('acknowledged', '2026-10-15');
  await make('closed', '2026-10-15').catch(() => null);
  const result = await apply({ sources: ['query_response'] });
  assert.equal(result.totals.created, 1);
  const [n] = await notes();
  assert.deepEqual([n.recipientType, String(n.relatedInteraction), bucketOf(n)], ['employee', String(open._id), 'due_tomorrow']);
});

// ─── source state ────────────────────────────────────────────────────────────

test('completed tasks, fulfilled/cancelled requests, no-action USCIS, cancelled events and archived cases are ignored', async () => {
  const w = await world();
  await task(w, '2026-10-15', { status: 'completed', completedAt: NOW });

  const category = await DocumentCategory.create({ case: w.caseDoc._id, workspace: w.workspace._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  const request = (status, extra = {}) => DocumentRequest.create({ case: w.caseDoc._id, workspace: w.workspace._id, category: category._id, title: `Doc ${status}`, requestedFrom: w.clientMember._id, requestedBy: w.staff.user._id, dueDate: day('2026-10-15'), status, ...extra });
  await request('cancelled', { cancelledAt: NOW });
  await request('uploaded');
  await request('under_review');

  await USCISFiling.create({ case: w.caseDoc._id, workspace: w.workspace._id, title: 'I-140', formType: 'I-140', actionRequired: false, responseDueAt: day('2026-10-15'), clientVisible: true });
  await USCISFiling.create({ case: w.caseDoc._id, workspace: w.workspace._id, title: 'Archived', formType: 'I-140', actionRequired: true, responseDueAt: day('2026-10-15'), archivedAt: NOW });

  const event = (over) => CaseCalendarEvent.create({ case: w.caseDoc._id, workspace: w.workspace._id, internalTitle: 'E', allDay: true, startDate: '2026-10-15', employeeAttendees: [w.staff.user._id], ...over });
  await event({ status: 'cancelled', cancelledAt: NOW });
  await event({ status: 'completed' });

  const result = await apply();
  assert.equal(result.totals.candidates, 0, JSON.stringify(result));
  assert.equal(await Notification.countDocuments(), 0);

  const archivedCase = await world();
  await task(archivedCase, '2026-10-15');
  await ClientCase.updateOne({ _id: archivedCase.caseDoc._id }, { archivedAt: NOW });
  assert.equal((await apply({ sources: ['task'] })).totals.candidates, 0, 'archived cases are excluded');
});

// ─── recipients and preferences ──────────────────────────────────────────────

test('an employee who opted out of deadline reminders gets none; appointment reminders are a separate switch', async () => {
  const w = await world();
  await task(w, '2026-10-15');
  await NotificationPreference.create({ recipientType: 'employee', recipientAdmin: w.staff.user._id, deadlineReminders: false });
  const result = await apply({ sources: ['task'] });
  assert.deepEqual([result.totals.candidates, result.totals.skippedByPreference, result.totals.created], [1, 1, 0]);
  assert.equal(await Notification.countDocuments(), 0);

  await NotificationPreference.updateOne({ recipientAdmin: w.staff.user._id }, { deadlineReminders: true });
  assert.equal((await apply({ sources: ['task'] })).totals.created, 1);
});

test('a client who opted out gets no reminder, and other recipients are unaffected', async () => {
  const w = await world();
  const category = await DocumentCategory.create({ case: w.caseDoc._id, workspace: w.workspace._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  await DocumentRequest.create({ case: w.caseDoc._id, workspace: w.workspace._id, category: category._id, title: 'Passport', requestedFrom: w.clientMember._id, requestedBy: w.staff.user._id, dueDate: day('2026-10-15') });
  await NotificationPreference.create({ recipientType: 'client', recipientClient: w.client._id, deadlineReminders: false });
  const result = await apply({ sources: ['document_request'] });
  assert.deepEqual([result.totals.skippedByPreference, result.totals.created], [1, 1]);
  assert.deepEqual((await notes()).map((n) => n.recipientType), ['employee']);
});

test('a removed or deactivated employee and a removed client receive nothing', async () => {
  const w = await world();
  const t = await task(w, '2026-10-15');
  const category = await DocumentCategory.create({ case: w.caseDoc._id, workspace: w.workspace._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  await DocumentRequest.create({ case: w.caseDoc._id, workspace: w.workspace._id, category: category._id, title: 'Passport', requestedFrom: w.clientMember._id, requestedBy: w.staff.user._id, dueDate: day('2026-10-15') });
  assert.equal((await apply({ sources: ['task', 'document_request'], apply: false })).totals.wouldCreate, 3);

  await WorkspaceMember.updateOne({ _id: w.staff.member._id }, { status: 'removed' });
  await WorkspaceMember.updateOne({ _id: w.clientMember._id }, { status: 'removed' });
  const removed = await apply({ sources: ['task', 'document_request'] });
  assert.deepEqual([removed.totals.candidates, removed.totals.created], [0, 0], 'removed members are not notified');

  await WorkspaceMember.updateOne({ _id: w.staff.member._id }, { status: 'active' });
  await AdminUser.updateOne({ _id: w.staff.user._id }, { isActive: false });
  assert.equal((await apply({ sources: ['task'] })).totals.candidates, 0, 'a deactivated employee is not notified');
  await AdminUser.updateOne({ _id: w.staff.user._id }, { isActive: true });
  assert.equal((await apply({ sources: ['task'] })).totals.created, 1);
  assert.equal(String((await notes())[0].relatedTask), String(t._id));
});

test('an org-wide role assigned a task on a case they are not a member of is still reminded; a case-less task needs no membership', async () => {
  const w = await world();
  const admin = await employee('admin', null);
  await task(w, '2026-10-15', { assignee: admin.user._id });
  await Task.create({ case: null, title: 'Firm task', assignee: admin.user._id, dueDate: day('2026-10-15') });
  const result = await apply({ sources: ['task'] });
  assert.equal(result.totals.created, 2);
  const paths = (await notes()).map((n) => n.actionPath).sort();
  assert.deepEqual(paths, ['/tasks', `/cases/${w.caseDoc._id}?tab=tasks`].sort());
});

// ─── documents: the legacy overdue path stays the only client overdue sender ─

test('document requests: staff get overdue reminders, but the engine never sends a client overdue (the legacy pass owns it)', async () => {
  const w = await world();
  const category = await DocumentCategory.create({ case: w.caseDoc._id, workspace: w.workspace._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  const request = (title, due) => DocumentRequest.create({ case: w.caseDoc._id, workspace: w.workspace._id, category: category._id, title, requestedFrom: w.clientMember._id, requestedBy: w.staff.user._id, dueDate: day(due) });
  const overdue = await request('Overdue passport', '2026-10-12');
  const soon = await request('Soon diploma', '2026-10-15');

  await apply({ sources: ['document_request'] });
  const all = await notes();
  const forOverdue = all.filter((n) => String(n.relatedDocumentRequest) === String(overdue._id));
  assert.deepEqual(forOverdue.map((n) => [n.recipientType, bucketOf(n)]), [['employee', 'overdue']], 'no client overdue from the new engine');
  const forSoon = all.filter((n) => String(n.relatedDocumentRequest) === String(soon._id));
  assert.deepEqual(forSoon.map((n) => n.recipientType).sort(), ['client', 'employee']);
  assert.ok(all.every((n) => n.type !== 'document_request_overdue'), 'the engine never writes the legacy type');
  const clientNote = forSoon.find((n) => n.recipientType === 'client');
  assert.ok(!/Case IH-/.test(clientNote.message), 'no internal case number in a client message');
  assert.equal(clientNote.actionPath, `/portal/cases/${w.caseDoc._id}/documents`);
  assert.equal(forSoon.find((n) => n.recipientType === 'employee').actionPath, `/cases/${w.caseDoc._id}?tab=documents`);
});

test('the legacy document_request_overdue pass still sends its one client reminder, and the two senders never overlap', async () => {
  const w = await world();
  const category = await DocumentCategory.create({ case: w.caseDoc._id, workspace: w.workspace._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  const overdue = await DocumentRequest.create({ case: w.caseDoc._id, workspace: w.workspace._id, category: category._id, title: 'Overdue passport', requestedFrom: w.clientMember._id, requestedBy: w.staff.user._id, dueDate: new Date(Date.now() - 3 * 24 * 3600 * 1000) });
  assert.ok(/^mongodb:\/\/127\.0\.0\.1[:/]/.test(testUri), 'the legacy script may only be pointed at the disposable test database');

  const env = { ...process.env, MONGODB_URI: testUri, MAIL_TRANSPORT: 'none', RESEND_API_KEY: '', SMTP_HOST: '' };
  const legacy = spawnSync(process.execPath, [path.join(__dirname, '../../scripts/sendNotificationDigests.js'), '--apply', '--overdue-only'], { env, cwd: path.join(__dirname, '../..'), encoding: 'utf8', timeout: 60000 });
  assert.equal(legacy.status, 0, legacy.stderr + legacy.stdout);

  const real = new Date();
  const engine = await runReminders({ apply: true, now: real, sources: ['document_request'] });
  const all = await notes({ relatedDocumentRequest: overdue._id });
  assert.deepEqual(all.filter((n) => n.recipientType === 'client').map((n) => n.type), ['document_request_overdue'], 'exactly one client overdue notice, from the legacy pass');
  assert.deepEqual(all.filter((n) => n.recipientType === 'employee').map((n) => n.type), ['calendar_deadline_reminder']);
  assert.equal(engine.totals.created, 1);
});

// ─── USCIS ───────────────────────────────────────────────────────────────────

test('USCIS: the project manager follows the Staff snapshot; the client follows the newest CLIENT-VISIBLE event only', async () => {
  const w = await world();
  const filing = await USCISFiling.create({ case: w.caseDoc._id, workspace: w.workspace._id, title: 'I-140 petition', formType: 'I-140', actionRequired: true, responseDueAt: day('2026-10-15'), clientVisible: true });
  const event = (over) => USCISStatusEvent.create({ filing: filing._id, case: w.caseDoc._id, workspace: w.workspace._id, statusCategory: 'rfe_issued', statusTitle: 'RFE', source: 'manual', observedAt: NOW, actionRequired: true, ...over });
  await event({ occurredAt: new Date('2026-10-01T00:00:00Z'), responseDueAt: day('2026-10-18'), clientVisible: true });
  await event({ occurredAt: new Date('2026-10-05T00:00:00Z'), responseDueAt: day('2026-10-15'), clientVisible: false }); // internal and newer: Staff snapshot

  await apply({ sources: ['uscis'] });
  const all = await notes();
  const pm = all.find((n) => n.recipientType === 'employee');
  const client = all.find((n) => n.recipientType === 'client');
  assert.deepEqual([String(pm.recipientAdmin), bucketOf(pm), pm.dedupeKey.split(':')[4]], [String(w.pmUser._id), 'due_tomorrow', '2026-10-15']);
  assert.deepEqual([bucketOf(client), client.dedupeKey.split(':')[4]], ['due_within_7_days', '2026-10-18'], 'the hidden internal date never reaches the client');
  assert.equal(client.actionPath, `/portal/cases/${w.caseDoc._id}/uscis`);
  assert.equal(pm.actionPath, `/cases/${w.caseDoc._id}?tab=tracking&filing=${filing._id}`);
  assert.equal(all.length, 2);

  // A filing that is not client-visible never reaches a client, and a client-visible one with no visible action needs none.
  await USCISFiling.updateOne({ _id: filing._id }, { clientVisible: false });
  await Notification.deleteMany({ recipientType: 'client' });
  assert.equal((await apply({ sources: ['uscis'] })).totals.created, 0);
});

// ─── manual events ───────────────────────────────────────────────────────────

test('manual events: attendees get reminders, clients only for a client-visible event and only its client text', async () => {
  const w = await world();
  const other = await employee('reviewer', w.workspace);
  const timed = await CaseCalendarEvent.create({
    case: w.caseDoc._id, workspace: w.workspace._id, internalTitle: 'Internal prep: weak point in the evidence', internalDescription: 'secret', allDay: false,
    startAt: new Date('2026-10-15T10:00:00Z'), timeZone: 'America/New_York', employeeAttendees: [w.staff.user._id], clientVisible: true, clientTitle: 'Interview preparation call',
  });
  const hidden = await CaseCalendarEvent.create({ case: w.caseDoc._id, workspace: w.workspace._id, internalTitle: 'Hidden', allDay: false, startAt: new Date('2026-10-15T09:00:00Z'), timeZone: 'UTC', employeeAttendees: [other.user._id], clientVisible: false });
  const allDay = await CaseCalendarEvent.create({ case: w.caseDoc._id, workspace: w.workspace._id, internalTitle: 'Filing window opens', allDay: true, startDate: '2026-10-15', employeeAttendees: [w.staff.user._id] });

  await apply({ sources: ['manual_event'] });
  const all = await notes();
  const forTimed = all.filter((n) => n.dedupeKey.includes(`manual_event:${timed._id}:`));
  assert.deepEqual(forTimed.map((n) => n.recipientType).sort(), ['client', 'employee']);
  const clientNote = forTimed.find((n) => n.recipientType === 'client');
  assert.match(clientNote.message, /"Interview preparation call"/);
  for (const secret of ['Internal prep', 'weak point', 'secret', 'Case IH-']) assert.ok(!clientNote.message.includes(secret) && !clientNote.title.includes(secret), secret);
  assert.deepEqual(clientNote.type, 'calendar_appointment_reminder');
  assert.equal(clientNote.actionPath, `/portal/cases/${w.caseDoc._id}`);
  assert.equal(forTimed.find((n) => n.recipientType === 'employee').actionPath, `/cases/${w.caseDoc._id}?tab=calendar&event=${timed._id}`);

  assert.deepEqual(all.filter((n) => n.dedupeKey.includes(`manual_event:${hidden._id}:`)).map((n) => n.recipientType), ['employee'], 'an internal event never reaches a client');
  const forAllDay = all.filter((n) => n.dedupeKey.includes(`manual_event:${allDay._id}:`));
  assert.deepEqual([forAllDay.length, forAllDay[0].type, bucketOf(forAllDay[0])], [1, 'calendar_deadline_reminder', 'due_tomorrow']);

  await CaseCalendarEvent.updateOne({ _id: timed._id }, { status: 'cancelled', cancelledAt: NOW });
  assert.equal((await runReminders({ apply: true, now: new Date('2026-10-15T09:30:00Z'), sources: ['manual_event'] })).totals.created, 1, 'only the hidden event is still live (the cancelled one is not reminded)');
});

// ─── time zones ──────────────────────────────────────────────────────────────

test('a date-only deadline is judged on the recipient’s own calendar day', async () => {
  const w = await world();
  const tokyo = await employee('petition_writer', w.workspace, { zone: 'Asia/Tokyo' });
  const newYork = await employee('petition_writer', w.workspace, { zone: 'America/New_York' });
  const due = '2026-10-15';
  const t = await Task.create({ case: w.caseDoc._id, title: 'Zone task', assignee: tokyo.user._id, dueDate: day(due) });
  await Task.create({ case: w.caseDoc._id, title: 'Zone task NY', assignee: newYork.user._id, dueDate: day(due) });

  // 2026-10-14T20:00Z is already Oct 15 in Tokyo (05:00) and still Oct 14 in New York (16:00).
  await runReminders({ apply: true, now: new Date('2026-10-14T20:00:00Z'), sources: ['task'] });
  const all = await notes();
  assert.equal(bucketOf(all.find((n) => String(n.recipientAdmin) === String(tokyo.user._id))), 'due_today');
  assert.equal(bucketOf(all.find((n) => String(n.recipientAdmin) === String(newYork.user._id))), 'due_tomorrow');
  assert.equal(String(t.dueDate.toISOString()), '2026-10-15T00:00:00.000Z', 'the stored date is never shifted');
});

// ─── dry run, concurrency, tooling ───────────────────────────────────────────

test('a dry run writes nothing at all, reports safe counts only, and matches what apply then creates', async () => {
  const w = await world();
  await task(w, '2026-10-15');
  await task(w, '2026-10-12');
  const before = [await Notification.countDocuments(), await NotificationPreference.countDocuments()];

  const dry = await runReminders({ now: NOW });
  assert.equal(dry.mode, 'dry-run');
  assert.deepEqual([await Notification.countDocuments(), await NotificationPreference.countDocuments()], before, 'no notification and no default preference row');
  assert.equal(dry.totals.wouldCreate, 2);
  assert.equal(dry.totals.created, undefined);
  assert.deepEqual(dry.byBucket, { due_tomorrow: 1, overdue: 1 });
  assert.ok(!/Task |Alpha|Casey|@ih\.test|IH-2026/.test(JSON.stringify(dry)), 'counts only: no names, titles or case numbers');

  const lines = [];
  const scripted = await runScript({ apply: false, now: NOW, log: (l) => lines.push(l) });
  assert.equal(await Notification.countDocuments(), 0);
  assert.equal(scripted.totals.wouldCreate, 2);
  assert.ok(lines.some((l) => /DRY RUN \(writes nothing\)/.test(l)) && lines.some((l) => /Dry run only/.test(l)));
  assert.ok(!lines.join('\n').match(/Task |Alpha|Casey|@ih\.test|IH-2026/), 'script output is safe counts');

  const applied = await runScript({ apply: true, now: NOW, log: () => {} });
  assert.deepEqual([applied.totals.created, await Notification.countDocuments()], [2, 2]);
});

test('concurrent runs create each reminder exactly once', async () => {
  const w = await world();
  for (const due of ['2026-10-14', '2026-10-15', '2026-10-17', '2026-10-12']) await task(w, due);
  const results = await Promise.all(Array.from({ length: 6 }, () => apply({ sources: ['task'] })));
  assert.equal(await Notification.countDocuments(), 4);
  assert.equal(results.reduce((sum, r) => sum + r.totals.created, 0), 4, 'the runs together created exactly the four reminders');
  assert.equal(results.reduce((sum, r) => sum + r.totals.created + r.totals.alreadySent, 0), 24, 'every candidate was either created or recognised as already sent');
});

test('the unique dedupeKey index is what guarantees one reminder, even for two writers outside the engine', async () => {
  const w = await world();
  const t = await task(w, '2026-10-15');
  await apply({ sources: ['task'] });
  const [existing] = await notes();
  await assert.rejects(Notification.create({ ...existing, _id: undefined, createdAt: undefined, updatedAt: undefined }), (err) => err.code === 11000);
  assert.equal(String(existing.relatedTask), String(t._id));
});
