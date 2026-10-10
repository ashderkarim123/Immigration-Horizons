/**
 * Authorized global Staff search through the real Express app and a real MongoDB (ADR-028). Every source is a real
 * collection; the tests prove that each source's own capability and row scope hold, that nothing sensitive is searched or
 * returned, and that the query text is literal and never logged.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';
process.env.SEARCH_TELEMETRY_SILENT = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { createApp } = require('../../app');

const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const ChannelMember = require('../../models/ChannelMember');
const Task = require('../../models/admin/Task');
const Consultation = require('../../models/Consultation');
const CaseDocument = require('../../models/CaseDocument');
const DocumentCategory = require('../../models/DocumentCategory');
const ConsultationInteraction = require('../../models/ConsultationInteraction');
const EvidenceRequirement = require('../../models/EvidenceRequirement');
const CaseSmartForm = require('../../models/CaseSmartForm');
const CasePetition = require('../../models/CasePetition');
const FilingPacket = require('../../models/FilingPacket');
const USCISFiling = require('../../models/USCISFiling');
const { CAPABILITIES } = require('../../utils/permissions');
const { SOURCES } = require('../../services/search/sources');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const SECRETS = ['TASKNOTESECRET', 'REVIEWSECRET', 'EVIDENCESECRET', 'ANSWERSECRET', 'BODYSECRET', 'PACKETSECRET', 'STORAGESECRET', 'RESPONSESECRET'];

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;
const oid = () => new mongoose.Types.ObjectId();

test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function staffAgent(role, workspaces = []) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  const members = [];
  for (const ws of workspaces) members.push(await WorkspaceMember.create({ workspace: ws._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'contributor', status: 'active' }));
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD })).status, 200);
  return { agent, user, members };
}

async function seedCase(title, number) {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', lastName: 'Client', status: 'active' });
  const owner = await AdminUser.create({ name: 'Case Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({ caseNumber: number || `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title, caseType: 'eb2_niw', primaryClient: client._id, projectManager: owner._id, createdBy: owner._id, createdByName: owner.name });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  return { caseDoc, workspace, client, owner };
}

/** Everything searchable for "zorblax" on one case, plus secrets in every field search must never reach. */
async function seedSources(c, tag) {
  const category = await DocumentCategory.create({ case: c.caseDoc._id, workspace: c.workspace._id, name: 'Identity', slug: unique('identity'), order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  const base = { case: c.caseDoc._id, workspace: c.workspace._id };
  const task = await Task.create({ case: c.caseDoc._id, title: `Zorblax filing task ${tag}`, type: 'Evidence Review', notes: 'TASKNOTESECRET', assignee: c.owner._id });
  const doc = await CaseDocument.create({ ...base, category: category._id, uploadedByType: 'employee', uploadedByAdmin: c.owner._id, originalName: `zorblax-scan-${tag}.pdf`, displayName: `Zorblax passport ${tag}`, storageKey: 'STORAGESECRET/key', mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 10, checksum: 'abc', visibility: 'employees_only', internalReviewComment: 'REVIEWSECRET', documentType: 'Passport' });
  const query = await ConsultationInteraction.create({ interactionNumber: unique('INT'), scopeType: 'case', clientUser: c.client._id, ...base, subject: `Zorblax question ${tag}`, description: 'd', type: 'client_question', status: 'submitted', internalResponse: 'RESPONSESECRET', createdByType: 'client' });
  const evidence = await EvidenceRequirement.create({ ...base, source: 'custom', title: `Zorblax evidence ${tag}`, section: 'Identity', internalNotes: 'EVIDENCESECRET', staffGuidance: 'EVIDENCESECRET', createdBy: c.owner._id });
  const form = await CaseSmartForm.create({ ...base, template: oid(), templateKey: `zorblax_form_${tag}`, templateVersion: 1, templateTitleSnapshot: `Zorblax intake ${tag}`, answers: { q: 'ANSWERSECRET' }, internalReviewNote: 'ANSWERSECRET' });
  const petition = await CasePetition.create({ ...base, sequence: 1, title: `Zorblax petition ${tag}`, sections: [{ key: 's1', title: 'Intro', order: 1, body: 'BODYSECRET zorblaxbody' }], internalReviewNote: 'BODYSECRET' });
  const packet = await FilingPacket.create({ ...base, sequence: 1, title: `Zorblax packet ${tag}`, internalReviewNote: 'PACKETSECRET', items: [{ order: 1, type: 'smart_form_reference', notes: 'PACKETSECRET zorblaxnote' }] });
  const filing = await USCISFiling.create({ ...base, title: `Zorblax I-140 ${tag}`, formType: 'I-140', receiptNumber: tag === 'A' ? 'IOE9990001111' : 'IOE8880002222', currentStatusTitle: 'Case Was Received' });
  const open = await WorkspaceChannel.create({ ...base, name: `Zorblax general ${tag}`, slug: unique('general'), channelType: 'standard', visibility: 'all_members', order: 1 });
  const restricted = await WorkspaceChannel.create({ ...base, name: `Zorblax restricted ${tag}`, slug: unique('restricted'), channelType: 'private', visibility: 'restricted_members', order: 2 });
  return { task, doc, query, evidence, form, petition, packet, filing, open, restricted };
}

async function world() {
  const a = await seedCase('Zorblax alpha petition', 'IH-2026-ALPHA1');
  const b = await seedCase('Zorblax beta petition', 'IH-2026-BETA22');
  const sa = await seedSources(a, 'A');
  const sb = await seedSources(b, 'B');
  const clientHit = await ClientUser.create({ email: 'zorblax@clients.test', normalizedEmail: 'zorblax@clients.test', passwordHash: 'x', firstName: 'Zorblax', lastName: 'Clientson', status: 'active' });
  const lead = await Consultation.create({ name: 'Zorblax Lead', email: 'zorblax@leads.test', message: 'hello', service: 'EB-2 NIW' });
  const pm = await staffAgent('pm', [a.workspace]);
  const collector = await staffAgent('evidence_collector', [a.workspace]);
  const outsider = await staffAgent('pm', [b.workspace]);
  const admin = await staffAgent('admin');
  const viewer = await staffAgent('viewer');
  return { a, b, sa, sb, clientHit, lead, pm, collector, outsider, admin, viewer };
}

const search = (agent, qs) => agent.get(`/api/v1/staff/search?${qs}`);
const groupOf = (res, type) => res.body.data.groups.find((g) => g.type === type);
const titles = (res, type) => (groupOf(res, type)?.items || []).map((i) => i.title);
const typesOf = (res) => res.body.data.groups.map((g) => g.type);

// ─── validation ──────────────────────────────────────────────────────────────

test('query validation: 2 to 80 visible characters, known types, bounded page and limit', async () => {
  const w = await world();
  for (const qs of ['', 'q=', 'q=a', 'q=%20a%20', `q=${'x'.repeat(81)}`, 'q=ab%00cd']) assert.equal((await search(w.pm.agent, qs)).status, 422, qs);
  const bad = await search(w.pm.agent, 'q=zorblax&type=nonsense');
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.fieldErrors[0].field, 'type');
  assert.equal((await search(w.pm.agent, 'q=zorblax&types=cases,nonsense')).status, 422);
  assert.equal((await search(w.pm.agent, 'q=zorblax&type=cases&page=0')).status, 422);
  assert.equal((await search(w.pm.agent, 'q=zorblax&type=cases&limit=51')).status, 422);
  assert.equal((await search(w.pm.agent, 'q=zorblax&limit=11')).status, 422);
  assert.equal((await search(w.pm.agent, `q=${'x'.repeat(80)}`)).status, 200, 'exactly 80 is allowed');
  assert.equal((await search(w.pm.agent, 'q=zo')).status, 200, 'exactly 2 is allowed');
});

test('unauthenticated and client-cookie requests are refused', async () => {
  await world();
  assert.equal((await request(app).get('/api/v1/staff/search?q=zorblax')).status, 401);
  assert.equal((await request(app).get('/api/v1/staff/search?q=zorblax').set('Cookie', 'ih_client_session=abc; next-auth.session-token=abc')).status, 401);
});

// ─── authorization per source ────────────────────────────────────────────────

test('a PM finds only their own team across every source; the other team never appears', async () => {
  const w = await world();
  const res = await search(w.pm.agent, 'q=zorblax');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.meta.unavailableTypes, []);
  assert.deepEqual(titles(res, 'cases'), ['Zorblax alpha petition']);
  assert.deepEqual(titles(res, 'tasks'), ['Zorblax filing task A']);
  assert.deepEqual(titles(res, 'documents'), ['Zorblax passport A']);
  assert.deepEqual(titles(res, 'queries'), ['Zorblax question A']);
  assert.deepEqual(titles(res, 'evidence'), ['Zorblax evidence A']);
  assert.deepEqual(titles(res, 'forms'), ['Zorblax intake A']);
  assert.deepEqual(titles(res, 'petitions'), ['Zorblax petition A']);
  assert.deepEqual(titles(res, 'filing_packets'), ['Zorblax packet A']);
  assert.deepEqual(titles(res, 'uscis'), ['Zorblax I-140 A']);
  assert.deepEqual(titles(res, 'conversations'), ['Zorblax general A'], 'the restricted channel is not visible to a non-member');
  assert.deepEqual(titles(res, 'clients'), ['Zorblax Clientson']);
  assert.deepEqual(titles(res, 'consultations'), ['Zorblax Lead']);
  assert.ok(!JSON.stringify(res.body).includes(' B"') && !JSON.stringify(res.body).includes('beta'), 'nothing from team B');
});

test('an exact case number outside membership returns nothing; an admin with cases.view_all finds it', async () => {
  const w = await world();
  assert.deepEqual(titles(await search(w.pm.agent, 'q=IH-2026-BETA22&types=cases'), 'cases'), []);
  assert.deepEqual(titles(await search(w.pm.agent, 'q=ih-2026-beta22&type=cases'), 'cases'), []);
  assert.deepEqual(titles(await search(w.pm.agent, 'q=IH-2026-ALPHA1&types=cases'), 'cases'), ['Zorblax alpha petition']);
  assert.deepEqual(titles(await search(w.admin.agent, 'q=IH-2026-BETA22&types=cases'), 'cases'), ['Zorblax beta petition']);
  // The other team's receipt, document file name and channel are equally invisible by exact identifier.
  assert.deepEqual(titles(await search(w.pm.agent, 'q=IOE8880002222&types=uscis'), 'uscis'), []);
  assert.deepEqual(titles(await search(w.pm.agent, 'q=zorblax-scan-B.pdf&types=documents'), 'documents'), []);
  assert.deepEqual(titles(await search(w.admin.agent, 'q=IOE8880002222&types=uscis'), 'uscis'), ['Zorblax I-140 B']);
});

test('removing a member takes effect on the very next request', async () => {
  const w = await world();
  assert.equal(titles(await search(w.collector.agent, 'q=zorblax&types=cases,documents'), 'cases').length, 1);
  await WorkspaceMember.updateOne({ _id: w.collector.members[0]._id }, { status: 'removed' });
  const after = await search(w.collector.agent, 'q=zorblax');
  assert.equal(after.status, 200);
  for (const g of after.body.data.groups) assert.ok(!['cases', 'documents', 'evidence', 'forms', 'petitions', 'filing_packets', 'uscis', 'conversations'].includes(g.type) || g.items.length === 0, g.type);
});

test('sources the role cannot search are absent, a specialist cannot discover client emails, and type filters never widen access', async () => {
  const w = await world();
  const res = await search(w.collector.agent, 'q=zorblax');
  const offered = res.body.data.availableTypes.map((t) => t.type);
  for (const hidden of ['clients', 'queries', 'uscis', 'filing_packets']) assert.ok(!offered.includes(hidden), hidden);
  assert.ok(!typesOf(res).some((t) => ['clients', 'queries', 'uscis', 'filing_packets'].includes(t)));
  assert.deepEqual(typesOf(await search(w.collector.agent, 'q=zorblax@clients.test')).filter((t) => t === 'clients'), []);
  assert.equal((await search(w.collector.agent, 'q=zorblax&type=clients')).status, 403);
  assert.equal((await search(w.collector.agent, 'q=zorblax&type=uscis')).status, 403);
  const forced = await search(w.collector.agent, 'q=zorblax&types=clients,uscis,queries');
  assert.deepEqual(forced.body.data.groups, [], 'asking for hidden sources returns nothing');

  // Exact client email works for a role that holds clients.view.
  assert.deepEqual(titles(await search(w.pm.agent, 'q=zorblax@clients.test&types=clients'), 'clients'), ['Zorblax Clientson']);
});

test('removing a capability removes that source at once; a role with no case access sees only what it owns', async () => {
  const w = await world();
  const original = CAPABILITIES['documents.view'];
  CAPABILITIES['documents.view'] = original.filter((r) => r !== 'evidence_collector');
  try {
    const res = await search(w.collector.agent, 'q=zorblax');
    assert.ok(!typesOf(res).includes('documents'));
    assert.equal((await search(w.collector.agent, 'q=zorblax&type=documents')).status, 403);
  } finally {
    CAPABILITIES['documents.view'] = original;
  }
  const viewer = await search(w.viewer.agent, 'q=zorblax');
  assert.ok(!typesOf(viewer).includes('cases') && !typesOf(viewer).includes('tasks') || titles(viewer, 'tasks').length === 0);
  assert.deepEqual(titles(viewer, 'cases'), []);
});

test('tasks: team-wide for tasks.view_all within case scope, only your own otherwise, never another team’s', async () => {
  const w = await world();
  const second = await Task.create({ case: w.a.caseDoc._id, title: 'Zorblax collector task', assignee: w.collector.user._id });
  const pm = await search(w.pm.agent, 'q=zorblax&types=tasks');
  assert.deepEqual(titles(pm, 'tasks').sort(), ['Zorblax collector task', 'Zorblax filing task A']);
  const collector = await search(w.collector.agent, 'q=zorblax&types=tasks');
  assert.deepEqual(titles(collector, 'tasks'), ['Zorblax collector task'], 'a specialist sees only their own task');
  const outsider = await search(w.outsider.agent, 'q=zorblax&types=tasks');
  assert.ok(!titles(outsider, 'tasks').includes('Zorblax filing task A'));
  assert.ok(!titles(outsider, 'tasks').includes(second.title));
});

test('restricted conversations are invisible to a non-member, visible to a channel member and to channels.view_all', async () => {
  const w = await world();
  const channelNames = async (agent, q = 'zorblax') => titles(await search(agent, `q=${q}&types=conversations`), 'conversations');
  assert.deepEqual(await channelNames(w.pm.agent), ['Zorblax general A']);
  assert.deepEqual(await channelNames(w.pm.agent, 'restricted'), []);
  await ChannelMember.create({ channel: w.sa.restricted._id, workspaceMember: w.pm.members[0]._id, status: 'active' });
  assert.deepEqual((await channelNames(w.pm.agent)).sort(), ['Zorblax general A', 'Zorblax restricted A']);
  assert.deepEqual(await channelNames(w.collector.agent, 'restricted'), [], 'another member who is not on the channel');
  assert.ok((await channelNames(w.admin.agent, 'restricted')).includes('Zorblax restricted B'), 'channels.view_all sees every channel');
  // A channel is also found by the number of its case, within the actor's own cases.
  assert.deepEqual((await channelNames(w.pm.agent, 'IH-2026-ALPHA1')).sort(), ['Zorblax general A', 'Zorblax restricted A']);
  assert.deepEqual(await channelNames(w.pm.agent, 'IH-2026-BETA22'), []);
});

// ─── content never searched or returned ──────────────────────────────────────

test('bodies, answers, notes, storage keys and internal comments are neither searched nor returned', async () => {
  const w = await world();
  for (const secret of SECRETS.concat(['zorblaxbody', 'zorblaxnote'])) {
    const res = await search(w.admin.agent, `q=${secret}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.groups.reduce((n, g) => n + g.items.length, 0), 0, `${secret} must not be searchable`);
  }
  const res = await search(w.admin.agent, 'q=zorblax');
  const raw = JSON.stringify(res.body);
  for (const secret of SECRETS) assert.ok(!raw.includes(secret), `leaked ${secret}`);
});

test('every result has exactly the documented keys, a safe in-app href, and no raw model fields', async () => {
  const w = await world();
  const res = await search(w.admin.agent, 'q=zorblax');
  const keys = ['case', 'context', 'href', 'id', 'match', 'statusLabel', 'subtitle', 'title', 'type', 'updatedAt'];
  let total = 0;
  for (const g of res.body.data.groups) {
    assert.deepEqual(Object.keys(g).sort(), ['hasMore', 'items', 'label', 'type']);
    for (const item of g.items) {
      total += 1;
      assert.deepEqual(Object.keys(item).sort(), keys, g.type);
      assert.deepEqual(Object.keys(item.match).sort(), ['field', 'quality']);
      assert.ok(['exact', 'prefix', 'text'].includes(item.match.quality));
      assert.match(item.href, /^\/[A-Za-z0-9/_\-?=&.]*$/, `${g.type} href`);
      assert.ok(!item.href.startsWith('//'));
    }
  }
  assert.ok(total >= 12);
  const task = groupOf(res, 'tasks').items[0];
  assert.deepEqual(Object.keys(task.case).sort(), ['caseNumber', 'id', 'title']);
  const forbidden = ['_id', '__v', 'storageKey', 'checksum', 'passwordHash', 'answers', 'sections', 'internalNotes', 'internalReviewNote', 'internalResponse', 'notes', 'description', 'phone'];
  const rawKeys = new Set();
  JSON.stringify(res.body, (k, v) => { rawKeys.add(k); return v; });
  for (const f of forbidden) assert.ok(!rawKeys.has(f), `result exposes ${f}`);
});

test('deep links point at the owning module and tab', async () => {
  const w = await world();
  const res = await search(w.admin.agent, 'q=zorblax');
  const href = (type) => groupOf(res, type).items.find((i) => type === 'cases' ? i.title.includes('alpha') : type === 'conversations' ? i.title === 'Zorblax general A' : i.title.endsWith(' A') || type === 'clients' || type === 'consultations')?.href;
  assert.equal(href('tasks'), `/cases/${w.a.caseDoc._id}?tab=tasks`);
  assert.equal(href('documents'), `/documents/${w.sa.doc._id}`);
  assert.equal(href('queries'), `/consultations/${w.sa.query._id}`);
  assert.equal(href('evidence'), `/cases/${w.a.caseDoc._id}?tab=evidence`);
  assert.equal(href('forms'), `/cases/${w.a.caseDoc._id}?tab=forms`);
  assert.equal(href('petitions'), `/cases/${w.a.caseDoc._id}?tab=petition`);
  assert.equal(href('filing_packets'), `/cases/${w.a.caseDoc._id}?tab=packet`);
  assert.equal(href('uscis'), `/cases/${w.a.caseDoc._id}?tab=tracking&filing=${w.sa.filing._id}`);
  assert.equal(href('conversations'), `/cases/${w.a.caseDoc._id}?tab=chat&channel=${w.sa.open._id}`);
  assert.equal(href('clients'), `/clients/${w.clientHit._id}`);
  assert.equal(href('consultations'), `/intake/${w.lead._id}`);
  assert.equal(href('cases'), `/cases/${w.a.caseDoc._id}`);
});

// ─── query semantics ─────────────────────────────────────────────────────────

test('regex metacharacters are literal text', async () => {
  const w = await world();
  await ClientCase.create({ caseNumber: 'IH-2026-REGEX1', title: 'Plan (A+B) [draft] $5 ^caret', caseType: 'other', primaryClient: w.a.client._id, projectManager: w.a.owner._id, createdBy: w.a.owner._id, createdByName: 'x' });
  const find = async (q) => titles(await search(w.admin.agent, `q=${encodeURIComponent(q)}&types=cases`), 'cases');
  assert.deepEqual(await find('(A+B)'), ['Plan (A+B) [draft] $5 ^caret']);
  assert.deepEqual(await find('[draft]'), ['Plan (A+B) [draft] $5 ^caret']);
  assert.deepEqual(await find('$5 ^caret'), ['Plan (A+B) [draft] $5 ^caret']);
  for (const pattern of ['.*', '.+', '^Zor', 'Zorblax.*petition', '(?i)zorblax', '\\w+', '[a-z]+', 'a|b']) assert.deepEqual(await find(pattern), [], `${pattern} must not act as a pattern`);
});

test('ranking: exact identifier, then identifier prefix, then title prefix, then text, newest as tiebreaker', async () => {
  const w = await world();
  const mk = (number, title, when) => ClientCase.create({ caseNumber: number, title, caseType: 'other', primaryClient: w.a.client._id, projectManager: w.a.owner._id, createdBy: w.a.owner._id, createdByName: 'x', updatedAt: when });
  await mk('ZZZ-5', 'Text hit mentions RANK-1 inside', new Date('2026-01-01'));
  await mk('RANK-1', 'Exact one', new Date('2026-01-02'));
  await mk('RANK-10', 'Prefix ten', new Date('2026-01-03'));
  await mk('OTHER-9', 'RANK-1 title prefix', new Date('2026-01-04'));
  await mk('RANK-1000', 'Prefix thousand', new Date('2026-01-05'));
  const res = await search(w.admin.agent, 'q=RANK-1&types=cases');
  assert.deepEqual(titles(res, 'cases'), ['Exact one', 'Prefix thousand', 'Prefix ten', 'RANK-1 title prefix', 'Text hit mentions RANK-1 inside']);
  const items = groupOf(res, 'cases').items;
  assert.deepEqual(items.map((i) => i.match.quality), ['exact', 'prefix', 'prefix', 'prefix', 'text']);
  assert.equal(items[0].match.field, 'Case number');
});

test('USCIS receipts are normalized like Phase 11 and rank exact then prefix', async () => {
  const w = await world();
  for (const q of ['ioe 999-0001111', 'IOE9990001111', 'ioe9990001111']) assert.deepEqual(titles(await search(w.pm.agent, `q=${encodeURIComponent(q)}&types=uscis`), 'uscis'), ['Zorblax I-140 A'], q);
  const prefix = await search(w.pm.agent, 'q=IOE99900&types=uscis');
  assert.equal(groupOf(prefix, 'uscis').items[0].match.quality, 'prefix');
  assert.equal(groupOf(await search(w.pm.agent, 'q=IOE9990001111&types=uscis'), 'uscis').items[0].match.quality, 'exact');
  assert.equal(groupOf(await search(w.pm.agent, 'q=IOE9990001111&types=uscis'), 'uscis').items[0].match.field, 'Receipt number');
});

test('clients are matched by full name across first and last name', async () => {
  const w = await world();
  assert.deepEqual(titles(await search(w.pm.agent, 'q=Zorblax%20Clientson&types=clients'), 'clients'), ['Zorblax Clientson']);
  assert.deepEqual(titles(await search(w.pm.agent, 'q=clientson&types=clients'), 'clients'), ['Zorblax Clientson']);
});

// ─── bounds ──────────────────────────────────────────────────────────────────

test('quick search caps each source, full results paginate, and a page can never widen what is visible', async () => {
  const w = await world();
  await Task.insertMany(Array.from({ length: 60 }, (_, i) => ({ case: w.a.caseDoc._id, title: `Noise task ${String(i).padStart(2, '0')}`, assignee: w.pm.user._id })));
  await Task.insertMany(Array.from({ length: 20 }, (_, i) => ({ case: w.b.caseDoc._id, title: `Noise task other ${i}`, assignee: w.outsider.user._id })));

  const quick = await search(w.pm.agent, 'q=noise&types=tasks');
  const g = groupOf(quick, 'tasks');
  assert.deepEqual([g.items.length, g.hasMore], [5, true]);
  assert.equal((await search(w.pm.agent, 'q=noise&types=tasks&limit=10')).body.data.groups[0].items.length, 10);

  const page1 = await search(w.pm.agent, 'q=noise&type=tasks&limit=50');
  assert.deepEqual([page1.body.data.groups[0].items.length, page1.body.data.groups[0].hasMore, page1.body.data.page, page1.body.data.pageSize], [50, true, 1, 50]);
  const page2 = await search(w.pm.agent, 'q=noise&type=tasks&limit=50&page=2');
  assert.deepEqual([page2.body.data.groups[0].items.length, page2.body.data.groups[0].hasMore], [10, false], 'only the 60 authorized rows exist, never the 20 of the other team');
  const seen = new Set([...page1.body.data.groups[0].items, ...page2.body.data.groups[0].items].map((i) => i.id));
  assert.equal(seen.size, 60, 'stable order: no row repeats or is skipped across pages');
  assert.equal(groupOf(await search(w.pm.agent, 'q=noise&type=tasks&limit=50&page=3'), 'tasks').items.length, 0);
});

test('seeded noise: a short query stays bounded and an inaccessible exact identifier still returns nothing', async () => {
  const w = await world();
  await ClientCase.insertMany(Array.from({ length: 150 }, (_, i) => ({ caseNumber: `NOISE-${i}`, title: `Noise case ${i}`, caseType: 'other', primaryClient: w.b.client._id, projectManager: w.b.owner._id, createdBy: w.b.owner._id, createdByName: 'x' })));
  const adminQuick = await search(w.admin.agent, 'q=no');
  for (const group of adminQuick.body.data.groups) assert.ok(group.items.length <= 5, `${group.type} returned ${group.items.length}`);
  assert.deepEqual(titles(await search(w.pm.agent, 'q=NOISE-7&types=cases'), 'cases'), []);
  assert.equal(titles(await search(w.admin.agent, 'q=NOISE-7&types=cases'), 'cases').length > 0, true);
});

// ─── failure behavior and logging ────────────────────────────────────────────

test('a failed source is reported as unavailable, never as zero matches; a single-source search fails', async () => {
  const w = await world();
  const original = SOURCES.documents.model.aggregate;
  SOURCES.documents.model.aggregate = () => { throw Object.assign(new Error('boom: internal detail'), { code: 'E_TEST' }); };
  const quiet = console.info;
  console.info = () => {};
  try {
    const quick = await search(w.pm.agent, 'q=zorblax');
    assert.equal(quick.status, 200);
    assert.deepEqual(quick.body.meta.unavailableTypes, ['documents']);
    assert.ok(!typesOf(quick).includes('documents'), 'a failed source returns no group instead of an empty one');
    assert.ok(typesOf(quick).includes('cases'));
    const single = await search(w.pm.agent, 'q=zorblax&type=documents');
    assert.equal(single.status, 500);
    assert.ok(!JSON.stringify(single.body).includes('boom') && !JSON.stringify(single.body).includes('at '), 'no stack trace or internal message');
  } finally {
    SOURCES.documents.model.aggregate = original;
    console.info = quiet;
  }
});

test('the query text is never logged: only its length, sources, durations and counts', async () => {
  const w = await world();
  const lines = [];
  const original = { info: console.info, log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(original)) console[k] = (...args) => lines.push(args.map(String).join(' '));
  delete process.env.SEARCH_TELEMETRY_SILENT;
  try {
    await search(w.pm.agent, `q=${encodeURIComponent('zorblax@clients.test IOE9990001111')}`);
    await search(w.pm.agent, 'q=a');
  } finally {
    Object.assign(console, original);
    process.env.SEARCH_TELEMETRY_SILENT = '1';
  }
  const all = lines.join('\n');
  assert.ok(all.includes('[search]'), 'a safe telemetry line is written');
  const line = lines.find((l) => l.startsWith('[search]'));
  const logged = JSON.parse(line.slice('[search]'.length));
  assert.equal(logged.queryLength, 'zorblax@clients.test IOE9990001111'.length);
  assert.ok(logged.requestId && logged.durations && logged.counts);
  for (const text of ['zorblax', 'IOE9990001111', 'clients.test']) assert.ok(!all.includes(text), `log contains "${text}"`);
});
