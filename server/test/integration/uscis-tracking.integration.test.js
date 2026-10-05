/**
 * USCIS filing tracking through the real Express app and a real MongoDB (ADR-026): authorization
 * and concealment, the immutable event history and its deterministic snapshot, the cross-case queue,
 * notifications, and provider synchronization through an injected fake provider (never the network).
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
process.env.USCIS_SYNC_RATE_LIMIT = '1000';

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
const Notification = require('../../models/admin/Notification');
const USCISFiling = require('../../models/USCISFiling');
const USCISStatusEvent = require('../../models/USCISStatusEvent');
const tracking = require('../../services/uscisTracking');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const R1 = 'IOE1234567890';
const R2 = 'LIN2222222222';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  await Promise.all([USCISFiling.init(), USCISStatusEvent.init()]);
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(async () => {
  await clearCollections();
  app.locals.uscisProvider = fakeProvider();
});

// ─── fixtures ────────────────────────────────────────────────────────────────

function fakeProvider({ enabled = true, configured = true } = {}) {
  const p = {
    calls: [],
    next: null,
    status: () => ({ configured, enabled, environment: 'sandbox' }),
    async getStatus(receipt) {
      p.calls.push(receipt);
      const value = typeof p.next === 'function' ? p.next(receipt) : p.next;
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return p;
}
const providerError = (code) => Object.assign(new (require('../../services/uscis/torchProvider').ProviderError)(code));

const observation = ({ title = 'Case Was Received', description = 'We received your case.', modified = '2026-02-01T00:00:00Z', history = [], receipt = R1 } = {}) => ({
  receiptNumber: receipt,
  formType: 'I-140',
  submittedAt: null,
  providerModifiedAt: new Date(modified),
  current: { title, description, occurredAt: new Date(modified) },
  history: history.map((h) => ({ ...h, occurredAt: new Date(h.occurredAt), description: h.description || '' })),
  providerFingerprint: `fp-${title}-${modified}`,
});

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

/** A case team: PM (manage), uscis_forms_specialist (manage), petition_writer + reviewer (view only), a PM on another case, a role with no tracking access. */
async function seedTeam() {
  const ctx = await seedCase();
  const other = await seedCase('Other firm case');
  const pm = await staffAgent('pm', { workspace: ctx.workspace, workspaceRole: 'project_manager' });
  const specialist = await staffAgent('uscis_forms_specialist', { workspace: ctx.workspace });
  const writer = await staffAgent('petition_writer', { workspace: ctx.workspace });
  const reviewer = await staffAgent('reviewer', { workspace: ctx.workspace, workspaceRole: 'reviewer' });
  const outsider = await staffAgent('pm', { workspace: other.workspace, workspaceRole: 'project_manager' });
  const noAccess = await staffAgent('business_plan_specialist', { workspace: ctx.workspace });
  return { ...ctx, other, pm, specialist, writer, reviewer, outsider, noAccess };
}

const casePath = (c) => `/api/v1/staff/cases/${c._id}/uscis`;
const filingPath = (id, suffix = '') => `/api/v1/staff/uscis/${id}${suffix}`;
const post = (agent, url, body) => agent.post(url).set('Origin', ORIGIN).send(body);
const patch = (agent, url, body) => agent.patch(url).set('Origin', ORIGIN).send(body);
const newFiling = (agent, c, body = {}) => post(agent, casePath(c), { title: 'I-140 petition', formType: 'I-140', ...body });
const addStatus = (agent, id, body = {}) =>
  post(agent, filingPath(id, '/status-events'), { statusCategory: 'received', statusTitle: 'Case Was Received', occurredAt: '2026-02-01T00:00:00Z', ...body });

const iso = (s) => new Date(s).toISOString();

// ─── filings ─────────────────────────────────────────────────────────────────

test('create: a case can own several filings; receipt is normalized; the DTO is explicit and safe; activity and a staff notification follow', async () => {
  const t = await seedTeam();
  const res = await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: ' ioe-123 4567 890 ', formSubType: 'EB-2', serviceCenter: 'Nebraska', filedAt: '2026-01-05', clientVisible: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { filing, events, eventTotal } = res.body.data;
  assert.equal(filing.receiptNumber, R1);
  assert.equal(filing.providerEligible, true);
  assert.deepEqual([filing.title, filing.formType, filing.formSubType, filing.serviceCenter, filing.clientVisible, filing.archived], ['I-140 petition', 'I-140', 'EB-2', 'Nebraska', true, false]);
  assert.equal(filing.currentStatus, null);
  assert.deepEqual(filing.actions, { canEdit: true, canAddStatus: true, canArchive: true, canSync: true });
  assert.deepEqual([events, eventTotal], [[], 0]);
  for (const hidden of ['_id', '__v', 'workspace', 'currentEvent', 'createdBy', 'updatedBy', 'currentStatusCategory']) assert.equal(filing[hidden], undefined, hidden);

  assert.equal((await newFiling(t.pm.agent, t.caseDoc, { title: 'I-485 adjustment', formType: 'I-485', receiptNumber: R2 })).status, 201);
  assert.equal((await newFiling(t.pm.agent, t.caseDoc, { title: 'Draft filing' })).status, 201, 'a draft without a receipt is allowed');
  assert.equal((await newFiling(t.pm.agent, t.caseDoc, { title: 'Another draft' })).status, 201, 'any number of receipt-less drafts');

  const list = (await t.pm.agent.get(casePath(t.caseDoc))).body.data;
  assert.equal(list.filings.length, 4);
  assert.equal(list.actions.canCreate, true);

  const activity = await CaseActivity.find({ case: t.caseDoc._id, type: 'uscis_filing_created' }).lean();
  assert.equal(activity.length, 4);
  assert.match(activity[0].message, /^I-140 tracking record created by Staff pm\.$/);
  const note = await Notification.findOne({ recipientAdmin: t.owner._id, type: 'uscis_filing_added' }).lean();
  assert.ok(note, 'the case project manager hears about it');
  assert.equal(await Notification.countDocuments({ recipientAdmin: t.pm.user._id, type: 'uscis_filing_added' }), 0, 'the actor is not notified of their own action');
});

test('create: validation is 422 with field errors; receipts are unique globally (409), including different spellings; tracking needs a provider-shaped receipt', async () => {
  const t = await seedTeam();
  for (const [body, field] of [
    [{ title: '', formType: 'I-140' }, 'title'],
    [{ title: 'x', formType: '' }, 'formType'],
    [{ title: 'x'.repeat(151), formType: 'I-140' }, 'title'],
    [{ title: 'x', formType: 'I-140', receiptNumber: 'AB' }, 'receiptNumber'],
    [{ title: 'x', formType: 'I-140', receiptNumber: 'has space!' }, 'receiptNumber'],
    [{ title: 'x', formType: 'I-140', filedAt: 'last tuesday-ish' }, 'filedAt'],
    [{ title: 'x', formType: 'I-140', clientVisible: 'yes' }, 'clientVisible'],
    [{ title: 'x', formType: 'I-140', receiptNumber: 'MSC99XX12', trackingEnabled: true }, 'trackingEnabled'],
  ]) {
    const res = await post(t.pm.agent, casePath(t.caseDoc), body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.ok(res.body.error.fieldErrors.some((e) => e.field === field), `${JSON.stringify(body)} -> ${field}`);
  }
  assert.equal(await USCISFiling.countDocuments({}), 0);

  assert.equal((await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).status, 201);
  const dup = await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: 'ioe 1234567890' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'conflict');
  assert.equal(dup.body.error.fieldErrors[0].field, 'receiptNumber');
  assert.equal((await post(t.outsider.agent, casePath(t.other.caseDoc), { title: 'x', formType: 'I-140', receiptNumber: R1 })).status, 409, 'unique across cases too');
  assert.equal(await USCISFiling.countDocuments({}), 1);
});

test('edit: metadata only; duplicate receipts and archived filings are controlled 409s; receipt is locked once USCIS history exists', async () => {
  const t = await seedTeam();
  const a = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).body.data.filing;
  const b = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Second' })).body.data.filing;

  const edited = await patch(t.pm.agent, filingPath(a.id), { title: 'I-140 (premium)', serviceCenter: 'Texas', clientVisible: true, receiptDate: '2026-01-09' });
  assert.equal(edited.status, 200);
  assert.deepEqual([edited.body.data.filing.title, edited.body.data.filing.serviceCenter, edited.body.data.filing.clientVisible], ['I-140 (premium)', 'Texas', true]);
  assert.equal((await patch(t.pm.agent, filingPath(a.id), { title: 'I-140 (premium)' })).status, 200, 'unchanged is accepted');

  assert.equal((await patch(t.pm.agent, filingPath(b.id), { receiptNumber: R1 })).status, 409);
  assert.equal((await patch(t.pm.agent, filingPath(b.id), { receiptNumber: R2 })).status, 200);
  assert.equal((await patch(t.pm.agent, filingPath(a.id), { title: '' })).status, 422);
  assert.equal((await patch(t.pm.agent, filingPath(a.id), { receiptNumber: 'xx' })).status, 422);

  await USCISStatusEvent.create({ filing: a.id, case: t.caseDoc._id, workspace: t.workspace._id, statusCategory: 'received', statusTitle: 'Case Was Received', occurredAt: new Date(), observedAt: new Date(), source: 'uscis_api', providerEventKey: 'k1' });
  const locked = await patch(t.pm.agent, filingPath(a.id), { receiptNumber: 'LIN9999999999' });
  assert.equal(locked.status, 422);
  assert.match(locked.body.error.fieldErrors[0].message, /USCIS-sourced history/);

  assert.equal((await post(t.pm.agent, filingPath(a.id, '/archive'), {})).status, 200);
  assert.equal((await patch(t.pm.agent, filingPath(a.id), { title: 'nope' })).status, 409);
  assert.ok(await CaseActivity.findOne({ case: t.caseDoc._id, type: 'uscis_filing_updated' }));
});

test('archive: keeps the record and its history; archived filings leave the default list and accept no changes; no delete route exists', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).body.data.filing;
  await addStatus(t.pm.agent, f.id);

  const archived = await post(t.pm.agent, filingPath(f.id, '/archive'), {});
  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.filing.archived, true);
  assert.deepEqual(archived.body.data.filing.actions, { canEdit: false, canAddStatus: false, canArchive: false, canSync: false });
  assert.equal((await post(t.pm.agent, filingPath(f.id, '/archive'), {})).status, 200, 'archiving twice is harmless');

  assert.equal((await t.pm.agent.get(casePath(t.caseDoc))).body.data.filings.length, 0);
  assert.equal((await t.pm.agent.get(`${casePath(t.caseDoc)}?archived=true`)).body.data.filings.length, 1);
  assert.equal((await addStatus(t.pm.agent, f.id)).status, 409);
  assert.equal((await post(t.pm.agent, filingPath(f.id, '/sync'), {})).status, 409);

  assert.equal(await USCISFiling.countDocuments({ _id: f.id, archivedAt: { $ne: null } }), 1, 'never hard-deleted');
  assert.equal(await USCISStatusEvent.countDocuments({ filing: f.id }), 1, 'history is kept');
  assert.equal((await t.pm.agent.delete(filingPath(f.id)).set('Origin', ORIGIN)).status, 404);
  assert.ok(await CaseActivity.findOne({ case: t.caseDoc._id, type: 'uscis_filing_archived' }));
});

// ─── authorization ───────────────────────────────────────────────────────────

test('authorization: capability and case membership; view-only roles read but cannot mutate; no-capability roles are refused; outsiders and removed members are concealed', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).body.data.filing;

  assert.equal((await request(app).get(casePath(t.caseDoc))).status, 401);
  assert.equal((await request(app).get('/api/v1/staff/uscis')).status, 401);

  // viewers of tracking: a specialist who manages, and two view-only roles
  for (const who of [t.specialist, t.writer, t.reviewer]) {
    assert.equal((await who.agent.get(casePath(t.caseDoc))).status, 200, who.user.role);
    assert.equal((await who.agent.get(filingPath(f.id))).status, 200);
  }
  assert.equal((await t.specialist.agent.get(casePath(t.caseDoc))).body.data.actions.canCreate, true);
  for (const who of [t.writer, t.reviewer]) {
    assert.equal((await who.agent.get(casePath(t.caseDoc))).body.data.actions.canCreate, false);
    const detail = (await who.agent.get(filingPath(f.id))).body.data.filing;
    assert.deepEqual(detail.actions, { canEdit: false, canAddStatus: false, canArchive: false, canSync: false });
    assert.equal((await newFiling(who.agent, t.caseDoc)).status, 403);
    assert.equal((await patch(who.agent, filingPath(f.id), { title: 'x' })).status, 403);
    assert.equal((await addStatus(who.agent, f.id)).status, 403);
    assert.equal((await post(who.agent, filingPath(f.id, '/archive'), {})).status, 403);
    assert.equal((await post(who.agent, filingPath(f.id, '/sync'), {})).status, 403, 'view never implies sync');
  }
  assert.equal((await t.specialist.agent.post(filingPath(f.id, '/status-events')).set('Origin', ORIGIN).send({ statusCategory: 'received', statusTitle: 'Case Was Received', occurredAt: '2026-02-01T00:00:00Z' })).status, 201);

  // a role without the capability is refused outright, even as a case member
  for (const url of [casePath(t.caseDoc), filingPath(f.id), '/api/v1/staff/uscis', '/api/v1/staff/uscis/provider-status']) {
    assert.equal((await t.noAccess.agent.get(url)).status, 403, url);
  }

  // another case's PM: identical 404 to a filing that does not exist
  const ghost = await t.outsider.agent.get(filingPath('64b0f0f0f0f0f0f0f0f0f0f0'));
  assert.equal(ghost.status, 404);
  for (const [method, url, body] of [['get', casePath(t.caseDoc)], ['get', filingPath(f.id)], ['post', casePath(t.caseDoc), { title: 'x', formType: 'I-140' }], ['patch', filingPath(f.id), { title: 'x' }], ['post', filingPath(f.id, '/status-events'), {}], ['post', filingPath(f.id, '/archive'), {}], ['post', filingPath(f.id, '/sync'), {}]]) {
    const res = await (method === 'get' ? t.outsider.agent.get(url) : t.outsider.agent[method](url).set('Origin', ORIGIN).send(body));
    assert.equal(res.status, 404, `${method} ${url}`);
  }
  assert.equal((await t.outsider.agent.get(filingPath(f.id))).body.error.message.replace('Filing', 'X'), ghost.body.error.message.replace('Filing', 'X'));
  for (const bad of ['not-an-id', '123']) assert.equal((await t.pm.agent.get(filingPath(bad))).status, 404);
  assert.equal((await t.pm.agent.get('/api/v1/staff/cases/not-an-id/uscis')).status, 404);

  // org-wide roles do not need membership
  const admin = await staffAgent('super_admin');
  const ops = await staffAgent('operations_admin');
  assert.equal((await admin.agent.get(filingPath(f.id))).status, 200);
  assert.equal((await ops.agent.get(filingPath(f.id))).status, 200);
  assert.equal((await addStatus(ops.agent, f.id, { occurredAt: '2026-02-05T00:00:00Z' })).status, 201);

  // removal revokes everything on the very next request
  assert.equal((await t.pm.agent.get(filingPath(f.id))).status, 200);
  await WorkspaceMember.updateOne({ _id: t.pm.member._id }, { $set: { status: 'removed' } });
  assert.equal((await t.pm.agent.get(filingPath(f.id))).status, 404);
  assert.equal((await t.pm.agent.get(casePath(t.caseDoc))).status, 404);
  assert.equal((await addStatus(t.pm.agent, f.id)).status, 404);
  assert.equal((await t.pm.agent.get('/api/v1/staff/uscis')).body.data.total, 0);
});

test('every mutation requires a trusted Origin; a client account cannot sign in to the staff API', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc)).body.data.filing;
  for (const [method, url, body] of [['post', casePath(t.caseDoc), { title: 'x', formType: 'I-140' }], ['patch', filingPath(f.id), { title: 'x' }], ['post', filingPath(f.id, '/status-events'), {}], ['post', filingPath(f.id, '/sync'), {}], ['post', filingPath(f.id, '/archive'), {}]]) {
    const res = await t.pm.agent[method](url).set('Origin', 'https://evil.example.com').send(body);
    assert.equal(res.status, 403, `${method} ${url}`);
  }
  const login = await request(app).post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email: t.client.email, password: PASSWORD });
  assert.equal(login.status, 401);
});

// ─── events and the snapshot ─────────────────────────────────────────────────

test('status events: append, validate, record action-required with a due date; the filing snapshot follows', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).body.data.filing;

  for (const [body, field] of [
    [{ statusCategory: 'bogus' }, 'statusCategory'],
    [{ statusTitle: '   ' }, 'statusTitle'],
    [{ statusTitle: 'x'.repeat(201) }, 'statusTitle'],
    [{ statusDescription: 'x'.repeat(2001) }, 'statusDescription'],
    [{ occurredAt: null }, 'occurredAt'],
    [{ occurredAt: 'whenever' }, 'occurredAt'],
    [{ occurredAt: new Date(Date.now() + 5 * 86400000).toISOString() }, 'occurredAt'],
    [{ responseDueAt: '2026-06-01' }, 'responseDueAt'],
    [{ actionRequired: true, responseDueAt: 'later' }, 'responseDueAt'],
    [{ actionRequired: 'yes' }, 'actionRequired'],
    [{ clientVisible: 'yes' }, 'clientVisible'],
  ]) {
    const res = await addStatus(t.pm.agent, f.id, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.ok(res.body.error.fieldErrors.some((e) => e.field === field), `${JSON.stringify(body)} -> ${field}`);
  }
  assert.equal(await USCISStatusEvent.countDocuments({}), 0);

  const received = await addStatus(t.pm.agent, f.id);
  assert.equal(received.status, 201);
  assert.deepEqual([received.body.data.filing.currentStatus.category, received.body.data.filing.currentStatus.title, received.body.data.filing.currentStatus.source, received.body.data.filing.currentStatus.actionRequired], ['received', 'Case Was Received', 'manual', false]);

  const rfe = await addStatus(t.pm.agent, f.id, { statusCategory: 'rfe_issued', statusTitle: 'Request for Additional Evidence Was Mailed', statusDescription: 'Respond with employment letters.', occurredAt: '2026-03-10T00:00:00Z', actionRequired: true, responseDueAt: '2026-06-08', clientVisible: true });
  assert.equal(rfe.status, 201);
  const { currentStatus } = rfe.body.data.filing;
  assert.deepEqual([currentStatus.category, currentStatus.actionRequired, iso(currentStatus.responseDueAt)], ['rfe_issued', true, iso('2026-06-08')]);
  assert.deepEqual(rfe.body.data.events.map((e) => e.statusTitle), ['Request for Additional Evidence Was Mailed', 'Case Was Received'], 'newest first');
  assert.equal(rfe.body.data.eventTotal, 2);
  for (const e of rfe.body.data.events) for (const hidden of ['_id', 'providerEventKey', 'providerPayloadHash', 'createdBy']) assert.equal(e[hidden], undefined, hidden);

  const activity = await CaseActivity.find({ case: t.caseDoc._id, type: 'uscis_status_recorded' }).lean();
  assert.equal(activity.length, 2);
  for (const a of activity) assert.ok(!a.message.includes('Respond with employment letters'), 'activity never copies the description');
});

test('snapshot: a backfilled older event never rolls the current status back; ties go to the later event; concurrent writers cannot lose the newest', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc)).body.data.filing;
  await addStatus(t.pm.agent, f.id, { statusTitle: 'Approved', statusCategory: 'approved', occurredAt: '2026-05-01T00:00:00Z' });
  const backfill = await addStatus(t.pm.agent, f.id, { statusTitle: 'Received (backfilled)', occurredAt: '2026-01-01T00:00:00Z' });
  assert.equal(backfill.body.data.filing.currentStatus.title, 'Approved');
  assert.equal(backfill.body.data.eventTotal, 2);
  assert.equal((await CaseActivity.findOne({ case: t.caseDoc._id, message: /Received \(backfilled\)/ })).message.includes('updated to'), false, 'recorded, not "updated to"');

  const tie = await addStatus(t.pm.agent, f.id, { statusTitle: 'Denied', statusCategory: 'denied', occurredAt: '2026-05-01T00:00:00Z' });
  assert.equal(tie.body.data.filing.currentStatus.title, 'Denied', 'same instant: the later event wins');

  const g = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Race' })).body.data.filing;
  const days = [3, 9, 1, 12, 6, 2, 11, 5];
  await Promise.all(days.map((d) => addStatus(t.pm.agent, g.id, { statusTitle: `Day ${d}`, occurredAt: `2026-04-${String(d).padStart(2, '0')}T00:00:00Z` })));
  const raced = (await t.pm.agent.get(filingPath(g.id))).body.data;
  assert.equal(raced.filing.currentStatus.title, 'Day 12');
  assert.equal(raced.eventTotal, days.length);
});

test('rebuildCurrentSnapshot recomputes the same answer from the events, repairs a stale snapshot, and clears an empty one', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc)).body.data.filing;
  await addStatus(t.pm.agent, f.id, { statusTitle: 'Old', occurredAt: '2026-01-01T00:00:00Z' });
  await addStatus(t.pm.agent, f.id, { statusTitle: 'Newest', statusCategory: 'interview_scheduled', occurredAt: '2026-04-01T00:00:00Z', actionRequired: true, responseDueAt: '2026-04-20' });

  await USCISFiling.updateOne({ _id: f.id }, { $set: { currentStatusTitle: 'Corrupted', currentStatusCategory: 'denied', actionRequired: false, responseDueAt: null } });
  await tracking.rebuildCurrentSnapshot(f.id);
  const rebuilt = (await t.pm.agent.get(filingPath(f.id))).body.data.filing.currentStatus;
  assert.deepEqual([rebuilt.title, rebuilt.category, rebuilt.actionRequired, iso(rebuilt.responseDueAt)], ['Newest', 'interview_scheduled', true, iso('2026-04-20')]);

  const empty = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Empty' })).body.data.filing;
  await USCISFiling.updateOne({ _id: empty.id }, { $set: { currentStatusTitle: 'ghost', currentEvent: new (require('mongoose').Types.ObjectId)() } });
  await tracking.rebuildCurrentSnapshot(empty.id);
  assert.equal((await t.pm.agent.get(filingPath(empty.id))).body.data.filing.currentStatus, null);
});

test('events are append-only at the model: no update, replace or delete of any kind, and no HTTP route to attempt one', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc)).body.data.filing;
  await addStatus(t.pm.agent, f.id);
  const doc = await USCISStatusEvent.findOne({ filing: f.id });
  const stays = async () => assert.equal(await USCISStatusEvent.countDocuments({ filing: f.id, statusTitle: 'Case Was Received' }), 1);

  const attempts = [
    () => USCISStatusEvent.updateOne({ _id: doc._id }, { statusTitle: 'x' }),
    () => USCISStatusEvent.updateMany({}, { statusTitle: 'x' }),
    () => USCISStatusEvent.findOneAndUpdate({ _id: doc._id }, { statusTitle: 'x' }),
    () => USCISStatusEvent.findOneAndReplace({ _id: doc._id }, { statusTitle: 'x' }),
    () => USCISStatusEvent.replaceOne({ _id: doc._id }, { statusTitle: 'x' }),
    () => USCISStatusEvent.deleteOne({ _id: doc._id }),
    () => USCISStatusEvent.deleteMany({}),
    () => USCISStatusEvent.findOneAndDelete({ _id: doc._id }),
    () => doc.updateOne({ statusTitle: 'x' }),
    () => doc.deleteOne(),
    () => {
      doc.statusTitle = 'x';
      return doc.save();
    },
  ];
  for (const attempt of attempts) {
    await assert.rejects(Promise.resolve().then(attempt), /append-only/);
    await stays();
  }

  const eventId = doc._id;
  for (const method of ['put', 'patch', 'delete']) {
    assert.equal((await t.pm.agent[method](filingPath(f.id, `/status-events/${eventId}`)).set('Origin', ORIGIN).send({})).status, 404, method);
  }
});

// ─── queue ───────────────────────────────────────────────────────────────────

test('queue: rows are scoped to the actor’s cases; search and every filter only narrow that set', async () => {
  const t = await seedTeam();
  const mine = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Mine', receiptNumber: R1, formType: 'I-140' })).body.data.filing;
  const theirs = (await post(t.outsider.agent, casePath(t.other.caseDoc), { title: 'Theirs', formType: 'I-485', receiptNumber: R2 })).body.data.filing;
  await addStatus(t.pm.agent, mine.id, { statusCategory: 'rfe_issued', statusTitle: 'RFE', actionRequired: true, responseDueAt: '2026-06-01' });
  await addStatus(t.outsider.agent, theirs.id, { statusCategory: 'approved', statusTitle: 'Approved' });

  const q = (agent, query = '') => agent.get(`/api/v1/staff/uscis${query}`);
  const pmView = (await q(t.pm.agent)).body.data;
  assert.deepEqual(pmView.items.map((i) => i.title), ['Mine']);
  assert.deepEqual([pmView.total, pmView.page, pmView.totalPages, pmView.pageSize], [1, 1, 1, 25]);
  const row = pmView.items[0];
  assert.deepEqual(row.case, { id: String(t.caseDoc._id), caseNumber: t.caseDoc.caseNumber, title: 'Alpha petition' });
  assert.equal(row.client.displayName, 'Casey Client');
  assert.equal(row.projectManager.name, 'Case Owner');

  // searching for somebody else's receipt, case number or title returns nothing, never their rows
  for (const needle of [R2, theirs.title, t.other.caseDoc.caseNumber, 'I-485']) {
    assert.equal((await q(t.pm.agent, `?search=${encodeURIComponent(needle)}`)).body.data.total, 0, needle);
  }
  assert.equal((await q(t.pm.agent, `?search=${t.caseDoc.caseNumber}`)).body.data.total, 1, 'own case number matches');
  assert.equal((await q(t.pm.agent, '?search=ioe-123')).body.data.total, 1, 'receipt prefix, any spelling');
  assert.equal((await q(t.pm.agent, '?search=i-140')).body.data.total, 1, 'form type');
  assert.equal((await q(t.pm.agent, `?statusCategory=approved`)).body.data.total, 0, 'a filter cannot reach another case');
  assert.equal((await q(t.pm.agent, `?scope=all&search=%2E%2A`)).body.data.total, 0, 'regex characters are escaped');

  const admin = await staffAgent('super_admin');
  assert.equal((await q(admin.agent)).body.data.total, 2);
  assert.equal((await q(admin.agent, '?scope=mine')).body.data.total, 0, 'mine = membership, even for org-wide roles');
  assert.equal((await q(admin.agent, '?statusCategory=approved')).body.data.items[0].title, 'Theirs');
  assert.equal((await q(admin.agent, '?actionRequired=true')).body.data.items[0].title, 'Mine');
  assert.equal((await q(admin.agent, '?actionRequired=false')).body.data.items[0].title, 'Theirs');
  assert.equal((await q(admin.agent, '?statusCategory=nonsense')).body.data.total, 2, 'an unknown value is ignored, not an error');
  assert.equal((await q(admin.agent, '?hasDue=true')).body.data.total, 1);
  assert.equal((await q(admin.agent, '?responseDueFrom=2026-05-01&responseDueTo=2026-07-01')).body.data.total, 1);
  assert.equal((await q(admin.agent, '?responseDueFrom=2026-07-01')).body.data.total, 0);
  assert.equal((await q(admin.agent, '?trackingProvider=none')).body.data.total, 2);
  assert.equal((await q(admin.agent, '?trackingProvider=uscis_case_status')).body.data.total, 0);
});

test('queue: archived hidden by default, pagination is flat and bounded, sorting is stable, the dashboard count equals the queue', async () => {
  const t = await seedTeam();
  const filings = [];
  for (const [i, due] of [[1, '2026-09-01'], [2, '2026-07-01'], [3, null], [4, '2026-08-01']]) {
    const f = (await newFiling(t.pm.agent, t.caseDoc, { title: `F${i}` })).body.data.filing;
    filings.push(f);
    await addStatus(t.pm.agent, f.id, { statusTitle: `S${i}`, actionRequired: !!due, ...(due ? { responseDueAt: due } : {}) });
  }
  await post(t.pm.agent, filingPath(filings[3].id, '/archive'), {});
  const q = (query) => t.pm.agent.get(`/api/v1/staff/uscis${query}`);

  assert.equal((await q('')).body.data.total, 3);
  assert.equal((await q('?archived=true')).body.data.total, 4);

  const byDue = (await q('?actionRequired=true&sort=due')).body.data.items.map((i) => i.title);
  assert.deepEqual(byDue, ['F2', 'F1']);

  const page2 = (await q('?limit=2&page=2&sort=updated')).body.data;
  assert.deepEqual([page2.total, page2.totalPages, page2.page, page2.pageSize, page2.items.length], [3, 2, 2, 2, 1]);
  assert.equal((await q('?limit=1000')).body.data.pageSize, 100);
  assert.equal((await q('?page=-4&limit=abc')).body.data.page, 1);

  const dash = (await t.pm.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.equal(dash.uscisActionRequired, (await q('?actionRequired=true')).body.data.total);
  assert.equal(dash.uscisActionRequired, 2);
  const noAccess = (await t.noAccess.agent.get('/api/v1/staff/dashboard')).body.data;
  assert.equal(noAccess.uscisActionRequired, null, 'no capability: no card, not a misleading 0');
});

test('case workspace: the Tracking tab is offered only to roles with uscis_tracking.view', async () => {
  const t = await seedTeam();
  const tabs = async (who) => (await who.agent.get(`/api/v1/staff/cases/${t.caseDoc._id}`)).body.data.availableTabs;
  assert.ok((await tabs(t.pm)).includes('tracking'));
  assert.ok((await tabs(t.reviewer)).includes('tracking'));
  assert.ok(!(await tabs(t.noAccess)).includes('tracking'));
});

// ─── provider ────────────────────────────────────────────────────────────────

test('provider-status: operational facts only; reflects the injected provider; needs the view capability', async () => {
  const t = await seedTeam();
  app.locals.uscisProvider = fakeProvider({ enabled: true, configured: true });
  assert.deepEqual((await t.pm.agent.get('/api/v1/staff/uscis/provider-status')).body.data, { configured: true, enabled: true, environment: 'sandbox' });
  app.locals.uscisProvider = fakeProvider({ enabled: false, configured: false });
  assert.deepEqual((await t.pm.agent.get('/api/v1/staff/uscis/provider-status')).body.data, { configured: false, enabled: false, environment: 'sandbox' });
  delete app.locals.uscisProvider; // the real adapter with no USCIS_* environment: safely off
  const real = (await t.pm.agent.get('/api/v1/staff/uscis/provider-status')).body.data;
  assert.deepEqual([real.configured, real.enabled], [false, false]);
  assert.deepEqual(Object.keys(real).sort(), ['configured', 'enabled', 'environment']);
});

test('sync: imports history and the current status once; replays and unchanged observations add nothing and notify nobody', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1, clientVisible: true })).body.data.filing;
  const provider = app.locals.uscisProvider;
  provider.next = observation({
    title: 'Case Is Being Actively Reviewed By USCIS',
    description: 'Reviewing <b>now</b>.',
    modified: '2026-02-01T00:00:00Z',
    history: [{ occurredAt: '2026-01-05T00:00:00Z', title: 'Case Was Received' }],
  });

  const first = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(provider.calls, [R1]);
  const d = first.body.data;
  assert.equal(d.eventTotal, 2);
  assert.deepEqual([d.filing.currentStatus.title, d.filing.currentStatus.category, d.filing.currentStatus.source], ['Case Is Being Actively Reviewed By USCIS', 'actively_reviewed', 'uscis_api']);
  assert.deepEqual(d.events.map((e) => [e.statusCategory, e.source, e.clientVisible, e.actionRequired]), [['actively_reviewed', 'uscis_api', true, false], ['received', 'uscis_api', true, false]], 'provider events never invent action-required; they inherit the filing’s visibility');
  assert.equal(d.filing.provider.enabled, true);
  assert.equal(d.filing.provider.type, 'uscis_case_status');
  assert.ok(d.filing.provider.lastCheckedAt && d.filing.provider.lastSuccessfulSyncAt);
  assert.equal(d.filing.provider.lastErrorCode, null);
  assert.equal(d.events[0].statusDescription, 'Reviewing now.');

  const secretFree = JSON.stringify(first.body);
  for (const leak of ['providerEventKey', 'providerPayloadHash', 'providerModifiedAt', 'fp-', 'client_secret', 'access_token']) assert.ok(!secretFree.includes(leak), leak);

  const notes = await Notification.countDocuments({ relatedCase: t.caseDoc._id, type: { $in: ['uscis_status_changed', 'uscis_action_required'] } });
  assert.ok(notes >= 1);

  // identical observation: no new events, no new notifications, only the checked time moves
  const before = (await USCISFiling.findById(f.id).lean()).lastCheckedAt;
  await new Promise((r) => setTimeout(r, 10));
  const second = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
  assert.equal(second.status, 200);
  assert.equal(await USCISStatusEvent.countDocuments({ filing: f.id }), 2);
  assert.equal(await Notification.countDocuments({ relatedCase: t.caseDoc._id, type: { $in: ['uscis_status_changed', 'uscis_action_required'] } }), notes);
  assert.ok((await USCISFiling.findById(f.id).lean()).lastCheckedAt > before);

  // a changed current status adds exactly one event and one more notification round
  provider.next = observation({ title: 'Case Was Approved', modified: '2026-03-01T00:00:00Z', history: [{ occurredAt: '2026-01-05T00:00:00Z', title: 'Case Was Received' }] });
  const third = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
  assert.equal(third.body.data.eventTotal, 3);
  assert.deepEqual([third.body.data.filing.currentStatus.title, third.body.data.filing.currentStatus.category], ['Case Was Approved', 'approved']);
  assert.ok((await Notification.countDocuments({ relatedCase: t.caseDoc._id, type: 'uscis_status_changed' })) > 0);
});

test('sync: provider history older than the current status is imported without rolling it back; a current status equal to the last history entry is not duplicated', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).body.data.filing;
  await addStatus(t.pm.agent, f.id, { statusTitle: 'Staff recorded approval', statusCategory: 'approved', occurredAt: '2026-06-01T00:00:00Z' });

  app.locals.uscisProvider.next = observation({ title: 'Case Was Received', modified: '2026-01-05T00:00:00Z', history: [{ occurredAt: '2026-01-05T00:00:00Z', title: 'Case Was Received' }] });
  const res = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
  assert.equal(res.body.data.eventTotal, 2, 'one provider event, not two');
  assert.equal(res.body.data.filing.currentStatus.title, 'Staff recorded approval');
});

test('sync: provider failures map to safe errors, keep the known status, and record only a safe code', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc, { receiptNumber: R1 })).body.data.filing;
  await addStatus(t.pm.agent, f.id, { statusTitle: 'Known status' });
  const provider = app.locals.uscisProvider;

  for (const [code, status, apiCode] of [
    ['provider_receipt_not_found', 422, 'receipt_not_found_at_uscis'],
    ['provider_rate_limited', 429, 'provider_rate_limited'],
    ['provider_unavailable', 502, 'provider_unavailable'],
    ['provider_auth_failed', 502, 'provider_unavailable'],
    ['provider_bad_response', 502, 'provider_unavailable'],
  ]) {
    provider.next = providerError(code);
    const res = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
    assert.equal(res.status, status, code);
    assert.equal(res.body.error.code, apiCode, code);
    assert.ok(!JSON.stringify(res.body).includes('provider_auth_failed'), 'the internal code is not exposed as the reason');
    const stored = await USCISFiling.findById(f.id).lean();
    assert.equal(stored.currentStatusTitle, 'Known status', 'the known status is untouched');
    assert.equal(stored.lastSyncErrorCode, code);
    assert.ok(stored.lastCheckedAt && stored.lastSyncErrorAt);
  }
  assert.equal(await USCISStatusEvent.countDocuments({ filing: f.id }), 1);

  provider.next = observation();
  const ok = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.data.filing.provider.lastErrorCode, ok.body.data.filing.provider.lastErrorAt], [null, null], 'a success clears the error state');
});

test('sync: needs a configured provider, a provider-shaped receipt and an open filing; canSync tells the UI the same', async () => {
  const t = await seedTeam();
  const draft = (await newFiling(t.pm.agent, t.caseDoc)).body.data.filing;
  const manual = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Odd receipt', receiptNumber: 'MSC99XX12' })).body.data.filing;
  const eligible = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Eligible', receiptNumber: R1 })).body.data.filing;
  assert.deepEqual([draft.actions.canSync, manual.actions.canSync, eligible.actions.canSync], [false, false, true]);

  for (const f of [draft, manual]) {
    const res = await post(t.pm.agent, filingPath(f.id, '/sync'), {});
    assert.equal(res.status, 422);
    assert.equal(res.body.error.fieldErrors[0].field, 'receiptNumber');
  }
  assert.equal(app.locals.uscisProvider.calls.length, 0, 'the provider is never called for an ineligible filing');

  app.locals.uscisProvider = fakeProvider({ enabled: false, configured: false });
  const off = await post(t.pm.agent, filingPath(eligible.id, '/sync'), {});
  assert.equal(off.status, 409);
  assert.equal(off.body.error.code, 'provider_not_configured');
  assert.equal((await t.pm.agent.get(filingPath(eligible.id))).body.data.filing.actions.canSync, false, 'no fake sync action when the provider is off');
  assert.equal((await t.pm.agent.get(casePath(t.caseDoc))).body.data.filings.find((x) => x.id === eligible.id).actions.canSync, false);
  assert.equal(app.locals.uscisProvider.calls.length, 0);
});

// ─── notifications ───────────────────────────────────────────────────────────

test('notifications: staff are notified once per current-status change; clients only when the filing AND event are visible and they are still on the case', async () => {
  const t = await seedTeam();
  const visible = (await newFiling(t.pm.agent, t.caseDoc, { clientVisible: true })).body.data.filing;
  const hidden = (await newFiling(t.pm.agent, t.caseDoc, { title: 'Internal', clientVisible: false })).body.data.filing;
  const count = (filter) => Notification.countDocuments({ relatedCase: t.caseDoc._id, ...filter });

  // internal event on a visible filing: staff yes, client no
  await addStatus(t.pm.agent, visible.id, { statusTitle: 'Internal note', clientVisible: false });
  assert.equal(await count({ recipientAdmin: t.owner._id, type: 'uscis_status_changed' }), 1);
  assert.equal(await count({ recipientType: 'client' }), 0);

  // visible event on an internal filing: still no client notification
  await addStatus(t.pm.agent, hidden.id, { statusTitle: 'Visible event, hidden filing', clientVisible: true });
  assert.equal(await count({ recipientType: 'client' }), 0);

  // visible + visible: the client is told, with no internal detail; action-required uses its own type
  await addStatus(t.pm.agent, visible.id, { statusCategory: 'rfe_issued', statusTitle: 'RFE mailed', occurredAt: '2026-03-01T00:00:00Z', clientVisible: true, actionRequired: true, responseDueAt: '2026-05-30' });
  const clientNote = await Notification.findOne({ recipientClient: t.client._id }).lean();
  assert.equal(clientNote.type, 'uscis_action_required');
  assert.equal(clientNote.message, 'Your I-140 status is now: RFE mailed.');
  assert.ok(await Notification.findOne({ recipientAdmin: t.owner._id, type: 'uscis_action_required' }));

  // a backfilled older event changed nothing current, so nobody is notified
  const before = await Notification.countDocuments({});
  await addStatus(t.pm.agent, visible.id, { statusTitle: 'Backfill', occurredAt: '2026-01-01T00:00:00Z', clientVisible: true });
  assert.equal(await Notification.countDocuments({}), before);

  // a removed client member is not notified
  await WorkspaceMember.updateOne({ _id: t.clientMember._id }, { $set: { status: 'removed' } });
  await addStatus(t.pm.agent, visible.id, { statusTitle: 'After removal', occurredAt: '2026-04-01T00:00:00Z', clientVisible: true });
  assert.equal(await Notification.countDocuments({ recipientClient: t.client._id }), 1);

  // notification dedupe keys are per event, so a repeated delivery attempt cannot double up
  const keys = (await Notification.find({ type: { $regex: '^uscis_' }, dedupeKey: { $ne: null } }).select('dedupeKey').lean()).map((n) => n.dedupeKey);
  assert.equal(new Set(keys).size, keys.length);
});

test('a notification failure never rolls back the tracking event', async () => {
  const t = await seedTeam();
  const f = (await newFiling(t.pm.agent, t.caseDoc)).body.data.filing;
  const original = Notification.create;
  Notification.create = async () => {
    throw new Error('mail down');
  };
  try {
    const res = await addStatus(t.pm.agent, f.id);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.filing.currentStatus.title, 'Case Was Received');
  } finally {
    Notification.create = original;
  }
  assert.equal(await USCISStatusEvent.countDocuments({ filing: f.id }), 1);
});
