/**
 * Operational reports and CSV export through the real Express app and a real MongoDB (ADR-028): authorization and scope, the
 * snapshot-versus-period distinction, parity with the Dashboard work queues, null-versus-zero, and an export that can never
 * contain a row the screen would not show.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
process.env.REPORT_EXPORT_RATE_LIMIT = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');
const { staffAgent, seedCase, oid } = require('../helpers/searchReportFixtures');

const ClientCase = require('../../models/ClientCase');
const WorkspaceMember = require('../../models/WorkspaceMember');
const Task = require('../../models/admin/Task');
const CaseDocument = require('../../models/CaseDocument');
const DocumentCategory = require('../../models/DocumentCategory');
const DocumentRequest = require('../../models/DocumentRequest');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const EvidenceRequirement = require('../../models/EvidenceRequirement');
const CaseSmartForm = require('../../models/CaseSmartForm');
const CasePetition = require('../../models/CasePetition');
const FilingPacket = require('../../models/FilingPacket');
const USCISFiling = require('../../models/USCISFiling');
const CaseCalendarEvent = require('../../models/CaseCalendarEvent');
const SecurityEvent = require('../../models/SecurityEvent');
const { CAPABILITIES } = require('../../utils/permissions');
const T = require('../../utils/calendarTime');

let app;
test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

const today = () => T.todayInZone('UTC');
const day = (offset) => new Date(`${T.addDays(today(), offset)}T00:00:00.000Z`);
const get = (agent, path) => agent.get(`/api/v1/staff/reports/${path}`);
const metrics = (res) => Object.fromEntries([...res.body.data.snapshot, ...res.body.data.period.metrics].map((m) => [m.key, m.value]));

/** Two teams. A: pm is its project manager and member, collector is a member. B: its own pm. Rich data on both. */
async function world() {
  const a = await seedCase('Alpha case', 'IH-2026-ALPHA1');
  const b = await seedCase('Beta case', 'IH-2026-BETA22', { caseType: 'o1', priority: 'urgent' });
  const pm = await staffAgent(app, 'pm', [a.workspace], { name: 'Pat Manager' });
  const collector = await staffAgent(app, 'evidence_collector', [a.workspace]);
  const outsider = await staffAgent(app, 'pm', [b.workspace], { name: 'Olive Outsider' });
  const admin = await staffAgent(app, 'admin', [], { name: 'Ada Admin' });
  const viewer = await staffAgent(app, 'viewer');
  await ClientCase.updateOne({ _id: a.caseDoc._id }, { projectManager: pm.user._id, currentStage: 'drafting', targetFilingDate: day(5) });
  await ClientCase.updateOne({ _id: b.caseDoc._id }, { projectManager: outsider.user._id, currentStage: 'filed', targetFilingDate: day(6) });

  const seed = async (c, who, tag) => {
    const base = { case: c.caseDoc._id, workspace: c.workspace._id };
    const category = await DocumentCategory.create({ ...base, name: 'Identity', slug: `identity-${tag}`, order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
    await Task.create([
      { case: c.caseDoc._id, title: `${tag} open task`, assignee: who._id, dueDate: day(3) },
      { case: c.caseDoc._id, title: `${tag} overdue task`, assignee: who._id, dueDate: day(-4) },
      { case: c.caseDoc._id, title: `${tag} unassigned task`, assignee: null },
      { case: c.caseDoc._id, title: `${tag} done task`, assignee: who._id, status: 'completed', completedAt: new Date(), dueDate: day(-1) },
    ]);
    const doc = (name, status) => CaseDocument.create({ ...base, category: category._id, uploadedByType: 'employee', uploadedByAdmin: who._id, originalName: `${name}.pdf`, displayName: name, storageKey: `k/${name}`, mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 1, checksum: 'x', visibility: 'employees_only', status });
    await doc(`${tag} review doc`, 'pending_review');
    await doc(`${tag} quarantined doc`, 'quarantined');
    const member = await WorkspaceMember.create({ workspace: c.workspace._id, memberType: 'client', clientUser: c.client._id, workspaceRole: 'client', status: 'active' });
    await DocumentRequest.create({ ...base, category: category._id, title: `${tag} request`, requestedFrom: member._id, requestedBy: who._id, dueDate: day(-2), status: 'open' });
    await EvidenceRequirement.create({ ...base, source: 'custom', title: `${tag} evidence`, createdBy: who._id });
    await CaseSmartForm.create({ ...base, template: oid(), templateKey: `form_${tag}`, templateVersion: 1, templateTitleSnapshot: `${tag} form`, status: 'submitted' });
    await CasePetition.create({ ...base, sequence: 1, title: `${tag} petition`, status: 'internal_review' });
    await FilingPacket.create({ ...base, sequence: 1, title: `${tag} packet`, status: 'review' });
    await USCISFiling.create({ ...base, title: `${tag} I-140`, formType: 'I-140', actionRequired: true, responseDueAt: day(2) });
    await ConsultationInteraction.create({ interactionNumber: `INT-${tag}`, scopeType: 'case', clientUser: c.client._id, ...base, subject: `${tag} query`, description: 'd', type: 'client_question', status: 'submitted', responseDueAt: day(-1), createdByType: 'client' });
  };
  await seed(a, pm.user, 'A');
  await seed(b, outsider.user, 'B');
  return { a, b, pm, collector, outsider, admin, viewer };
}

// ─── guards ──────────────────────────────────────────────────────────────────

test('every report needs a session and reports.view; roles without it are refused', async () => {
  const w = await world();
  for (const name of ['overview', 'pipeline', 'workload', 'deadlines', 'review-queues']) {
    assert.equal((await request(app).get(`/api/v1/staff/reports/${name}`)).status, 401, name);
    assert.equal((await request(app).get(`/api/v1/staff/reports/${name}`).set('Cookie', 'ih_client_session=abc')).status, 401, `${name} client cookie`);
    assert.equal((await get(w.collector.agent, name)).status, 403, `${name} specialist`);
    assert.equal((await get(w.viewer.agent, name)).status, 403, `${name} viewer`);
    assert.equal((await get(w.pm.agent, name)).status, 200, `${name} pm`);
  }
  assert.equal((await request(app).get('/api/v1/staff/reports/export.csv?report=workload')).status, 401);
});

test('scope: accessible is the live case policy, mine is project-manager ownership, firm needs cases.view_all and is refused, not narrowed', async () => {
  const w = await world();
  const active = async (agent, qs = '') => (await get(agent, `overview${qs}`)).body.data.snapshot.find((m) => m.key === 'activeCases').value;
  assert.equal(await active(w.pm.agent), 1, 'a PM sees only their member case');
  assert.equal(await active(w.pm.agent, '?scope=accessible'), 1);
  assert.equal(await active(w.pm.agent, '?scope=mine'), 1);
  assert.equal(await active(w.admin.agent), 2, 'view_all: the whole firm');
  assert.equal(await active(w.admin.agent, '?scope=firm'), 2);
  assert.equal(await active(w.admin.agent, '?scope=mine'), 0, 'an admin who manages no case has an empty (but authorized) personal scope');

  const refused = await get(w.pm.agent, 'overview?scope=firm');
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error.code, 'forbidden');
  assert.equal((await get(w.pm.agent, 'overview?scope=galaxy')).status, 422);

  // mine honours ownership even inside the member scope: a second member case the PM does not manage is excluded
  await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { projectManager: w.outsider.user._id });
  assert.equal(await active(w.pm.agent, '?scope=mine'), 0);
  assert.equal(await active(w.pm.agent, '?scope=accessible'), 1);
});

// ─── snapshot versus period ──────────────────────────────────────────────────

test('overview labels every metric snapshot or period, and a period never changes a snapshot', async () => {
  const w = await world();
  const res = await get(w.pm.agent, 'overview');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.meta.basis, res.body.meta.scope, res.body.meta.timeZone], ['mixed', 'accessible', 'UTC']);
  assert.ok(res.body.meta.asOf && res.body.meta.requestId);
  assert.ok(res.body.data.snapshot.every((m) => m.basis === 'snapshot'));
  assert.ok(res.body.data.period.metrics.every((m) => m.basis === 'period'));
  assert.deepEqual([res.body.meta.from, res.body.meta.to], [T.addDays(today(), -89), today()], 'default period is the previous 90 days');

  const m = metrics(res);
  assert.deepEqual(
    [m.activeCases, m.openTasks, m.overdueTasks, m.unassignedTasks, m.documentsAwaitingReview, m.overdueDocumentRequests, m.missingEvidence, m.formsAwaitingReview, m.petitionsAwaitingReview, m.packetsAwaitingReview, m.uscisActionRequired, m.unansweredQueries],
    [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  );
  assert.deepEqual([m.casesOpened, m.casesClosed, m.tasksCompleted], [1, 0, 1]);

  const past = await get(w.pm.agent, `overview?from=${T.addDays(today(), -300)}&to=${T.addDays(today(), -200)}`);
  const pm = metrics(past);
  assert.deepEqual([pm.casesOpened, pm.casesClosed, pm.tasksCompleted], [0, 0, 0], 'nothing happened in that old period');
  assert.deepEqual([pm.activeCases, pm.openTasks, pm.overdueTasks], [m.activeCases, m.openTasks, m.overdueTasks], 'the snapshot ignores the period');

  await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { archivedAt: new Date() });
  const closed = metrics(await get(w.pm.agent, 'overview'));
  assert.deepEqual([closed.activeCases, closed.casesClosed], [0, 1], 'an archived case leaves the snapshot and enters the period');
});

test('period validation: real dates, from not after to, and at most 366 days', async () => {
  const w = await world();
  const bad = ['from=2026-13-01&to=2026-12-01', 'from=nope', `from=${T.addDays(today(), 5)}&to=${today()}`, `from=${T.addDays(today(), -400)}&to=${today()}`, 'to=2026-02-30'];
  for (const qs of bad) assert.equal((await get(w.pm.agent, `overview?${qs}`)).status, 422, qs);
  assert.equal((await get(w.pm.agent, `overview?from=${T.addDays(today(), -365)}&to=${today()}`)).status, 200, 'exactly 366 days');
  assert.equal((await get(w.pm.agent, `pipeline?from=${T.addDays(today(), -366)}&to=${today()}`)).status, 422, '367 days');
  const wrong = await get(w.pm.agent, 'overview?from=2020-01-01&to=2026-12-31');
  assert.equal(wrong.body.error.fieldErrors[0].field, 'from');
});

test('unavailable metrics are null, never zero; a database failure is an error, never zeroes', async () => {
  const w = await world();
  const original = { uscis: CAPABILITIES['uscis_tracking.view'], queries: CAPABILITIES['queries.view'] };
  CAPABILITIES['uscis_tracking.view'] = original.uscis.filter((r) => r !== 'pm');
  CAPABILITIES['queries.view'] = original.queries.filter((r) => r !== 'pm');
  try {
    const m = metrics(await get(w.pm.agent, 'overview'));
    assert.deepEqual([m.uscisActionRequired, m.unansweredQueries], [null, null]);
    assert.equal(m.activeCases, 1, 'other metrics are unaffected');
  } finally {
    Object.assign(CAPABILITIES, { 'uscis_tracking.view': original.uscis, 'queries.view': original.queries });
  }
  const m = metrics(await get(w.pm.agent, 'overview'));
  assert.deepEqual([m.uscisActionRequired, m.unansweredQueries], [1, 1], 'genuine zero is a number, and here the counts are real');

  const aggregate = ClientCase.countDocuments;
  ClientCase.countDocuments = () => Promise.reject(new Error('db down'));
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal((await get(w.pm.agent, 'overview')).status, 500);
  } finally {
    ClientCase.countDocuments = aggregate;
    console.error = quiet;
  }
});

// ─── pipeline ────────────────────────────────────────────────────────────────

test('pipeline: active cases by stage, type, priority and manager inside scope; filters only narrow', async () => {
  const w = await world();
  const res = await get(w.pm.agent, 'pipeline');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = res.body.data.snapshot;
  assert.equal(s.total, 1);
  assert.equal(s.byStage.find((x) => x.key === 'drafting').count, 1);
  assert.equal(s.byStage.find((x) => x.key === 'filed').count, 0, 'the other team’s stage is not counted');
  assert.equal(s.byStage.reduce((n, x) => n + x.count, 0), 1);
  assert.equal(s.byCaseType.find((x) => x.key === 'eb2_niw').count, 1);
  assert.equal(s.byCaseType.find((x) => x.key === 'o1').count, 0);
  assert.deepEqual(s.byPriority.find((x) => x.key === 'medium'), { key: 'medium', label: 'Medium', count: 1 });
  assert.deepEqual(s.byProjectManager.map((x) => [x.label, x.count]), [['Pat Manager', 1]]);

  const admin = (await get(w.admin.agent, 'pipeline')).body.data.snapshot;
  assert.equal(admin.total, 2);
  assert.equal((await get(w.admin.agent, 'pipeline?caseType=o1')).body.data.snapshot.total, 1);
  assert.equal((await get(w.admin.agent, 'pipeline?stage=drafting')).body.data.snapshot.total, 1);
  assert.equal((await get(w.admin.agent, 'pipeline?priority=urgent')).body.data.snapshot.total, 1);
  assert.equal((await get(w.admin.agent, `pipeline?projectManager=${w.outsider.user._id}`)).body.data.snapshot.total, 1);
  assert.equal((await get(w.admin.agent, 'pipeline?caseType=o1&stage=drafting')).body.data.snapshot.total, 0, 'filters combine by narrowing');
  assert.equal((await get(w.pm.agent, 'pipeline?caseType=o1')).body.data.snapshot.total, 0, 'a filter cannot reach another team');
  for (const qs of ['caseType=nope', 'stage=nope', 'priority=nope', 'projectManager=nope', 'granularity=day']) assert.equal((await get(w.pm.agent, `pipeline?${qs}`)).status, 422, qs);
});

test('pipeline period series: every bucket is present, opened and closed are counted in the viewer time zone', async () => {
  const w = await world();
  // 2026-03-01T03:00Z is still Feb 28 in New York.
  await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { openedAt: new Date('2026-03-01T03:00:00Z'), archivedAt: new Date('2026-04-10T12:00:00Z') });
  const ny = await staffAgent(app, 'admin', [], { timeZone: 'America/New_York' });
  const res = await get(ny.agent, 'pipeline?from=2026-02-01&to=2026-04-30&granularity=month');
  const series = res.body.data.period.series;
  assert.deepEqual(series.map((s) => s.bucket), ['2026-02', '2026-03', '2026-04']);
  assert.deepEqual(series.map((s) => s.opened), [1, 0, 0], 'opened late on Feb 28 in New York');
  assert.deepEqual(series.map((s) => s.closed), [0, 0, 1]);
  assert.equal(res.body.meta.timeZone, 'America/New_York');
  assert.deepEqual(res.body.data.period.totals, { opened: 1, closed: 1 });

  const utc = await get(w.admin.agent, 'pipeline?from=2026-02-01&to=2026-04-30&granularity=month');
  assert.deepEqual(utc.body.data.period.series.map((s) => s.opened), [0, 1, 0], 'the same instant is March in UTC');

  const weeks = await get(w.admin.agent, 'pipeline?from=2026-03-02&to=2026-03-22');
  assert.equal(weeks.body.data.period.granularity, 'week', 'a short period defaults to weeks');
  assert.deepEqual(weeks.body.data.period.series.map((s) => s.start), ['2026-03-02', '2026-03-09', '2026-03-16']);
  assert.equal((await get(w.admin.agent, `pipeline?from=${T.addDays(today(), -200)}&to=${today()}`)).body.data.period.granularity, 'month');
});

// ─── workload ────────────────────────────────────────────────────────────────

test('workload: open work per employee inside scope, unassigned counted separately, others’ rows need tasks.view_all', async () => {
  const w = await world();
  const res = await get(w.pm.agent, 'workload');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.meta.basis, 'snapshot');
  const rows = res.body.data.snapshot.rows;
  assert.deepEqual(rows.map((r) => [r.name, r.openCases, r.openTasks, r.overdueTasks, r.dueSoonTasks]), [['Pat Manager', 1, 2, 1, 1]]);
  assert.equal(res.body.data.snapshot.unassignedTasks, 1, 'only the unassigned task of the PM’s own case');
  assert.equal(res.body.data.snapshot.casesWithoutProjectManager, 0);

  const admin = (await get(w.admin.agent, 'workload')).body.data.snapshot;
  assert.deepEqual(admin.rows.map((r) => r.name), ['Olive Outsider', 'Pat Manager'], 'alphabetical, never ranked');
  assert.equal(admin.unassignedTasks, 2);
  await ClientCase.updateOne({ _id: w.b.caseDoc._id }, { projectManager: null });
  assert.equal((await get(w.admin.agent, 'workload')).body.data.snapshot.casesWithoutProjectManager, 1);

  const original = CAPABILITIES['tasks.view_all'];
  CAPABILITIES['tasks.view_all'] = original.filter((r) => r !== 'pm');
  try {
    await Task.create({ case: w.a.caseDoc._id, title: 'Teammate task', assignee: w.collector.user._id });
    const own = (await get(w.pm.agent, 'workload')).body.data.snapshot;
    assert.deepEqual(own.rows.map((r) => r.name), ['Pat Manager'], 'without tasks.view_all only the actor’s own row');
    assert.equal(own.unassignedTasks, null, 'unassigned work is not visible, so it is null rather than 0');
  } finally {
    CAPABILITIES['tasks.view_all'] = original;
  }
});

// ─── deadlines ───────────────────────────────────────────────────────────────

test('deadlines reuse the calendar: only authorized deadline kinds, overdue/today/7/30 buckets, other teams absent', async () => {
  const w = await world();
  await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { targetFilingDate: day(0) });
  await CaseCalendarEvent.create({ case: w.a.caseDoc._id, workspace: w.a.workspace._id, eventType: 'deadline', internalTitle: 'Court deadline', allDay: true, startDate: T.addDays(today(), 20) });
  await CaseCalendarEvent.create({ case: w.a.caseDoc._id, workspace: w.a.workspace._id, eventType: 'meeting', internalTitle: 'Team meeting', allDay: true, startDate: T.addDays(today(), 2) });
  const res = await get(w.pm.agent, 'deadlines');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = res.body.data.snapshot;
  const titles = s.rows.map((r) => r.title);
  for (const expected of ['A open task', 'A overdue task', 'Document due: A request', 'USCIS response due: A I-140', 'Response due: A query', 'Court deadline']) assert.ok(titles.some((t) => t.includes(expected)), expected);
  assert.ok(titles.some((t) => t.startsWith('Target filing')));
  assert.ok(!titles.some((t) => t.includes('Team meeting')), 'meetings are not deadlines');
  assert.ok(!titles.some((t) => /^B |Beta/.test(t)), 'the other team’s dates never appear');
  assert.ok(s.rows.every((r) => r.case.caseNumber === 'IH-2026-ALPHA1'));
  assert.deepEqual([s.overdue, s.dueToday, s.dueWithin7Days, s.dueWithin30Days], [3, 1, 3, 4], 'overdue: task, request, query response; today: target filing; within 7 days (cumulative): filing, USCIS, task; within 30 days adds the court deadline');
  assert.equal(s.bySource.reduce((n, x) => n + x.count, 0), s.rows.length);
  assert.ok(s.rows.every((r) => typeof r.link.path === 'string'));
  const overdueFirst = s.rows.map((r) => r.date);
  assert.deepEqual(overdueFirst, [...overdueFirst].sort(), 'overdue first, then upcoming, by date');

  const only = (await get(w.pm.agent, 'deadlines?source=task_due')).body.data.snapshot;
  assert.ok(only.rows.every((r) => r.kind === 'task_due'));
  assert.equal((await get(w.pm.agent, 'deadlines?source=appointment')).status, 422, 'appointments are not a deadline source');

  const admin = (await get(w.admin.agent, 'deadlines')).body.data.snapshot;
  assert.ok(admin.rows.some((r) => r.case.caseNumber === 'IH-2026-BETA22'));
  assert.equal((await get(w.admin.agent, 'deadlines?caseType=o1')).body.data.snapshot.rows.every((r) => r.case.caseNumber === 'IH-2026-BETA22'), true);

  const original = CAPABILITIES['documents.view'];
  CAPABILITIES['documents.view'] = original.filter((r) => r !== 'pm');
  try {
    const noDocs = (await get(w.pm.agent, 'deadlines')).body.data.snapshot.rows;
    assert.ok(!noDocs.some((r) => r.kind === 'document_due'), 'a source capability the actor lacks removes that source, exactly as in the calendar');
  } finally {
    CAPABILITIES['documents.view'] = original;
  }
});

// ─── review queues ───────────────────────────────────────────────────────────

test('review queues match the Dashboard work queues, add the extra workflow queues, and only count in-scope cases', async () => {
  const w = await world();
  const res = await get(w.pm.agent, 'review-queues');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const queues = Object.fromEntries(res.body.data.snapshot.queues.map((q) => [q.key, q]));
  const dashboard = (await w.pm.agent.get('/api/v1/staff/dashboard')).body.data.workQueues;
  for (const key of ['document_review', 'document_requests', 'missing_evidence', 'forms_review', 'petition_review', 'packet_review']) {
    const dash = dashboard.find((q) => q.key === key);
    assert.ok(dash, `dashboard defines ${key}`);
    assert.equal(queues[key].count, dash.count, `${key} agrees with the Dashboard`);
  }
  assert.equal(queues.documents_quarantined.count, 1);
  assert.equal(queues.uscis_action_required.count, 1);
  assert.equal(queues.queries_unanswered.count, 1);
  assert.equal(queues.queries_overdue.count, 1);
  for (const q of Object.values(queues)) assert.ok(q.rows.every((r) => r.caseNumber === 'IH-2026-ALPHA1'), `${q.key} only lists the PM’s case`);
  assert.deepEqual(Object.keys(queues.document_review.rows[0]).sort(), ['caseId', 'caseNumber', 'caseTitle', 'count', 'link']);

  const admin = Object.fromEntries((await get(w.admin.agent, 'review-queues')).body.data.snapshot.queues.map((q) => [q.key, q]));
  assert.equal(admin.document_review.count, 2);
  assert.equal((await get(w.admin.agent, 'review-queues?source=document_review')).body.data.snapshot.queues.length, 1);
  assert.equal((await get(w.admin.agent, 'review-queues?source=nope')).status, 422);
});

test('a queue without its capability is unavailable (null), not zero', async () => {
  const w = await world();
  const original = CAPABILITIES['forms.review'];
  CAPABILITIES['forms.review'] = original.filter((r) => r !== 'pm');
  try {
    const q = (await get(w.pm.agent, 'review-queues')).body.data.snapshot.queues.find((x) => x.key === 'forms_review');
    assert.deepEqual([q.available, q.count, q.rows], [false, null, []]);
  } finally {
    CAPABILITIES['forms.review'] = original;
  }
});

test('removing a member takes effect on the very next request, in every report', async () => {
  const w = await world();
  const before = [metrics(await get(w.pm.agent, 'overview')).activeCases, (await get(w.pm.agent, 'pipeline')).body.data.snapshot.total, (await get(w.pm.agent, 'deadlines')).body.data.snapshot.rowsTotal, (await get(w.pm.agent, 'review-queues')).body.data.snapshot.queues.filter((q) => q.count > 0).length];
  assert.ok(before.every((n) => n > 0), JSON.stringify(before));
  await WorkspaceMember.updateOne({ _id: w.pm.members[0]._id }, { status: 'removed' });
  const after = [metrics(await get(w.pm.agent, 'overview')).activeCases, (await get(w.pm.agent, 'pipeline')).body.data.snapshot.total, (await get(w.pm.agent, 'deadlines')).body.data.snapshot.rowsTotal, (await get(w.pm.agent, 'review-queues')).body.data.snapshot.queues.filter((q) => q.count > 0).length];
  assert.deepEqual(after, [0, 0, 0, 0]);
  assert.deepEqual((await get(w.pm.agent, 'workload')).body.data.snapshot.rows, []);
});

// ─── CSV export ──────────────────────────────────────────────────────────────

const csv = (agent, qs) => agent.get(`/api/v1/staff/reports/export.csv?${qs}`).buffer(true).parse((res, cb) => { let d = ''; res.setEncoding('utf8'); res.on('data', (c) => (d += c)); res.on('end', () => cb(null, d)); });
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r') { /* skip */ } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  return rows;
};

test('export needs reports.view AND csv.export, and only the four exportable reports', async () => {
  const w = await world();
  assert.equal((await csv(w.collector.agent, 'report=workload')).status, 403);
  assert.equal((await csv(w.viewer.agent, 'report=workload')).status, 403);
  const original = CAPABILITIES['csv.export'];
  CAPABILITIES['csv.export'] = original.filter((r) => r !== 'pm');
  try {
    assert.equal((await csv(w.pm.agent, 'report=workload')).status, 403, 'reports.view alone is not enough');
  } finally {
    CAPABILITIES['csv.export'] = original;
  }
  const original2 = CAPABILITIES['reports.view'];
  CAPABILITIES['reports.view'] = original2.filter((r) => r !== 'pm');
  try {
    assert.equal((await csv(w.pm.agent, 'report=workload')).status, 403, 'csv.export alone is not enough');
  } finally {
    CAPABILITIES['reports.view'] = original2;
  }
  for (const report of ['overview', 'nope', '']) assert.equal((await csv(w.pm.agent, `report=${report}`)).status, 422, report);
  assert.equal((await csv(w.pm.agent, '')).status, 422);
  for (const report of ['pipeline', 'workload', 'deadlines', 'review-queues']) assert.equal((await csv(w.pm.agent, `report=${report}`)).status, 200, report);
});

test('export headers: text/csv, UTF-8, attachment with a safe deterministic filename, no caching', async () => {
  const w = await world();
  const res = await csv(w.pm.agent, 'report=workload');
  assert.match(res.headers['content-type'], /^text\/csv; charset=utf-8/);
  assert.match(res.headers['content-disposition'], /^attachment; filename="immigration-horizons-workload-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(!/Alpha|Beta|IH-2026|Pat|@/.test(res.headers['content-disposition']), 'no names or case numbers in the filename');
  assert.ok(res.body.startsWith('﻿"Employee"'), 'a UTF-8 BOM and stable quoted header names');
});

test('the export equals the screen row for row, never contains another team’s rows, and uses the same filters', async () => {
  const w = await world();
  for (const report of ['review-queues', 'deadlines', 'workload']) {
    const screen = (await get(w.pm.agent, report)).body.data.snapshot;
    const rows = parseCsv((await csv(w.pm.agent, `report=${report}`)).body);
    assert.ok(rows.length > 1, report);
    const text = rows.map((r) => r.join('|')).join('\n');
    assert.ok(!/BETA22|Beta case|Olive Outsider/.test(text), `${report}: no rows from the other team`);
    if (report === 'review-queues') assert.equal(rows.length - 1, screen.queues.filter((q) => q.available).reduce((n, q) => n + q.rowsTotal, 0));
    if (report === 'deadlines') assert.equal(rows.length - 1, screen.rowsTotal);
    if (report === 'workload') assert.equal(rows.length - 1, screen.rows.length + 1 + 1, 'employees + unassigned + cases without a manager');
  }
  const admin = parseCsv((await csv(w.admin.agent, 'report=review-queues')).body).map((r) => r.join('|')).join('\n');
  assert.ok(admin.includes('BETA22'), 'an admin’s firm scope does include it');
  const narrowed = parseCsv((await csv(w.admin.agent, 'report=review-queues&scope=firm&source=document_review&caseType=o1')).body);
  assert.deepEqual(narrowed.slice(1).map((r) => [r[0], r[1]]), [['Documents to review', 'IH-2026-BETA22']], 'filters narrow the export exactly as they narrow the screen');
  assert.equal((await csv(w.pm.agent, 'report=review-queues&scope=firm')).status, 403, 'the export refuses firm scope too');
  assert.equal(parseCsv((await csv(w.pm.agent, 'report=pipeline&caseType=o1')).body).slice(1).filter((r) => r[0].includes('snapshot')).every((r) => r[2] === '0'), true);
});

test('removing a member removes their rows from the very next export', async () => {
  const w = await world();
  assert.ok((await csv(w.pm.agent, 'report=review-queues')).body.includes('ALPHA1'));
  await WorkspaceMember.updateOne({ _id: w.pm.members[0]._id }, { status: 'removed' });
  const after = parseCsv((await csv(w.pm.agent, 'report=review-queues')).body);
  assert.equal(after.length, 1, 'header only');
});

test('formula-shaped, comma, quote and newline values are encoded safely', async () => {
  const w = await world();
  await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { title: '=HYPERLINK("http://evil.example","click")' });
  const text = (await csv(w.pm.agent, 'report=review-queues&source=document_review')).body;
  assert.ok(text.includes(`"'=HYPERLINK(""http://evil.example"",""click"")"`), 'neutralized with a leading apostrophe and quotes doubled');
  const rows = parseCsv(text);
  assert.equal(rows[1][2], `'=HYPERLINK("http://evil.example","click")`);

  for (const [title, expected] of [['+SUM(A1)', "'+SUM(A1)"], ['-2+3', "'-2+3"], ['@cmd', "'@cmd"], ['Plain, with "quotes"\nand a newline', 'Plain, with "quotes"\nand a newline']]) {
    await ClientCase.updateOne({ _id: w.a.caseDoc._id }, { title });
    const parsed = parseCsv((await csv(w.pm.agent, 'report=review-queues&source=document_review')).body);
    assert.equal(parsed[1][2], expected, title);
    assert.equal(parsed[1].length, 4, 'a comma or newline inside a value never splits the record');
  }
});

test('the row cap is enforced with a controlled error, and a smaller bounded export is a filter away', async () => {
  const w = await world();
  process.env.REPORT_EXPORT_MAX_ROWS = '3';
  try {
    const res = await csv(w.pm.agent, 'report=review-queues');
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body), /limit is 3/);
    assert.equal((await csv(w.pm.agent, 'report=review-queues&source=document_review')).status, 200, 'a narrower export fits');
    assert.equal((await SecurityEvent.countDocuments({ type: 'report_exported' })), 1, 'only the successful export is audited');
  } finally {
    delete process.env.REPORT_EXPORT_MAX_ROWS;
  }
});

test('a successful export is audited with safe metadata only', async () => {
  const w = await world();
  await csv(w.pm.agent, 'report=pipeline&caseType=eb2_niw');
  await csv(w.pm.agent, 'report=workload');
  assert.equal(await SecurityEvent.countDocuments({ type: 'report_exported' }), 2);
  const events = await SecurityEvent.find({ type: 'report_exported' }).sort({ createdAt: 1 }).lean();
  const [pipeline, workload] = events;
  for (const e of events) assert.deepEqual([e.result, e.surface, e.actorType, String(e.actorAdmin)], ['success', 'staff', 'admin_user', String(w.pm.user._id)]);
  assert.deepEqual(Object.keys(pipeline.meta).sort(), ['from', 'report', 'rowCount', 'scope', 'to']);
  assert.deepEqual(Object.keys(workload.meta).sort(), ['report', 'rowCount', 'scope']);
  assert.equal(pipeline.meta.report, 'pipeline');
  assert.ok(pipeline.meta.rowCount > 0);
  const raw = JSON.stringify(events);
  for (const pii of ['Alpha', 'Beta', 'IH-2026', 'Casey', 'Olive', '.csv', 'HYPERLINK']) assert.ok(!raw.includes(pii), `audit contains ${pii}`);
  assert.equal(await SecurityEvent.countDocuments({ type: 'report_exported', result: { $ne: 'success' } }), 0);
  await csv(w.collector.agent, 'report=workload');
  assert.equal(await SecurityEvent.countDocuments({ type: 'report_exported' }), 2, 'a refused export is not recorded as one');
});
