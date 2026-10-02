/**
 * Evidence checklist against a REAL ClientCase + primary CaseWorkspace
 * (Stabilization Phase 01, Batch B). The previous service read a
 * `clientCase.workspace` field that ClientCase does not have, so every
 * provision/create failed validation — and no test noticed because none drove
 * the domain through a real case.
 */
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

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
const CaseDocument = require('../../models/CaseDocument');
const DocumentCategory = require('../../models/DocumentCategory');
const EvidenceTemplate = require('../../models/EvidenceTemplate');
const EvidenceRequirement = require('../../models/EvidenceRequirement');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const BAD_ORIGIN = 'https://evil.example.com';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  await EvidenceRequirement.init(); // build the partial unique index before concurrency checks
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function staffAgent(role, { workspace = null, workspaceRole = 'project_manager' } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword: false });
  let member = null;
  if (workspace) member = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole, status: 'active' });
  const agent = request.agent(app);
  const login = await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, user, member };
}

async function seedCase({ caseType = 'eb2_niw' } = {}) {
  const email = `${unique('client')}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Casey', status: 'active' });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Evidence case',
    caseType,
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  return { caseDoc, workspace, owner };
}

async function seedDocument({ caseDoc, workspace, owner }, displayName = 'Degree.pdf') {
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    name: unique('Cat'),
    slug: unique('cat'),
    order: 1,
    visibility: 'employees_only',
    allowedUploaderTypes: 'both',
  });
  return CaseDocument.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: 'employee',
    uploadedByAdmin: owner._id,
    originalName: displayName,
    displayName,
    storageKey: unique('key'),
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: 'pdf',
    size: 10,
    checksum: 'abc',
    visibility: 'employees_only',
  });
}

/** Mirrors scripts/migrations/004-seed-evidence-templates.ts: no createdBy, status active. */
function seedTemplate(overrides = {}) {
  return EvidenceTemplate.create({
    key: 'eb2_niw_base',
    name: 'EB-2 NIW Canonical Evidence',
    caseType: 'eb2_niw',
    version: 1,
    status: 'active',
    items: [
      { key: 'degree', title: 'Advanced degree', importance: 'required', section: 'Basic Eligibility', order: 10, staffGuidance: 'Degree evaluation.' },
      { key: 'letters', title: 'Recommendation letters', importance: 'required', section: 'National Interest', order: 20 },
      { key: 'pubs', title: 'Publications', importance: 'optional', section: 'Supporting Evidence', order: 30 },
    ],
    ...overrides,
  });
}

const base = (caseDoc) => `/api/v1/staff/cases/${caseDoc._id}/evidence`;
const post = (agent, url, body) => agent.post(url).set('Origin', ORIGIN).send(body);

// ---------------------------------------------------------------------------
// Provisioning on a real case/workspace
// ---------------------------------------------------------------------------

test('provision: a real case + primary workspace provisions the checklist with the workspace persisted, idempotently', async () => {
  const ctx = await seedCase();
  await seedTemplate();
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });

  const first = await post(agent, `${base(ctx.caseDoc)}/provision`, { templateKey: 'eb2_niw_base' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.data, { created: 3, skipped: 0, template: { key: 'eb2_niw_base', version: 1 } });

  const rows = await EvidenceRequirement.find({ case: ctx.caseDoc._id }).lean();
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(String(row.workspace), String(ctx.workspace._id), 'workspace is the primary CaseWorkspace, never null');
    assert.equal(row.status, 'missing');
    assert.ok(row.createdBy, 'createdBy is the acting employee, not the template author');
  }

  const second = await post(agent, `${base(ctx.caseDoc)}/provision`, { templateKey: 'eb2_niw_base' });
  assert.deepEqual(second.body.data, { created: 0, skipped: 3, template: { key: 'eb2_niw_base', version: 1 } });
  assert.equal(await EvidenceRequirement.countDocuments({ case: ctx.caseDoc._id }), 3);
});

test('provision: the partial unique index rejects a duplicate template item and provisioning absorbs concurrent duplicates', async () => {
  const ctx = await seedCase();
  const row = (overrides = {}) => ({
    case: ctx.caseDoc._id,
    workspace: ctx.workspace._id,
    source: 'template',
    templateKey: 'eb2_niw_base',
    templateVersion: 1,
    templateItemKey: 'degree',
    title: 'Advanced degree',
    createdBy: ctx.owner._id,
    ...overrides,
  });

  await EvidenceRequirement.create(row());
  await assert.rejects(EvidenceRequirement.create(row()), (err) => err.code === 11000);
  // a different item, and any number of custom requirements, are unaffected
  await EvidenceRequirement.create(row({ templateItemKey: 'letters' }));
  await EvidenceRequirement.create(row({ source: 'custom', templateKey: null, templateVersion: null, templateItemKey: null }));
  await EvidenceRequirement.create(row({ source: 'custom', templateKey: null, templateVersion: null, templateItemKey: null }));
  assert.equal(await EvidenceRequirement.countDocuments({ case: ctx.caseDoc._id }), 4);

  // and provisioning absorbs concurrent duplicates instead of failing
  await seedTemplate();
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });
  const results = await Promise.all([1, 2, 3].map(() => post(agent, `${base(ctx.caseDoc)}/provision`, { templateKey: 'eb2_niw_base' })));
  assert.ok(results.every((r) => r.status === 200));
});

test('provision: validation — missing key, unknown template, retired template, wrong case type', async () => {
  const ctx = await seedCase({ caseType: 'eb2_niw' });
  await seedTemplate({ key: 'eb1a_base', caseType: 'eb1a' });
  await seedTemplate({ key: 'old_niw', status: 'retired' });
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });
  const url = `${base(ctx.caseDoc)}/provision`;

  for (const body of [{}, { templateKey: 'nope' }, { templateKey: 'old_niw' }, { templateKey: 'eb1a_base' }, { templateKey: 'eb1a_base', version: 'x' }]) {
    const res = await post(agent, url, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.equal(res.body.error.code, 'validation_error');
  }
  assert.equal(await EvidenceRequirement.countDocuments({}), 0);
});

test('templates: lists only active templates for the case type, latest version of each key', async () => {
  const ctx = await seedCase({ caseType: 'eb2_niw' });
  await seedTemplate({ version: 1 });
  await seedTemplate({ version: 2, name: 'EB-2 NIW v2' });
  await seedTemplate({ key: 'eb1a_base', caseType: 'eb1a' });
  await seedTemplate({ key: 'draft_niw', status: 'draft' });
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });

  const res = await agent.get(`${base(ctx.caseDoc)}/templates`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.templates, [{ key: 'eb2_niw_base', name: 'EB-2 NIW v2', description: '', caseType: 'eb2_niw', version: 2, itemCount: 3 }]);
});

// ---------------------------------------------------------------------------
// Custom requirements, listing, status
// ---------------------------------------------------------------------------

test('custom requirement: persists the workspace, starts missing, validates input; list DTO uses id and server actions', async () => {
  const ctx = await seedCase();
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });

  const created = await post(agent, `${base(ctx.caseDoc)}/requirements`, { title: '  Tax returns  ', section: 'Financial', importance: 'recommended', status: 'satisfied' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.title, 'Tax returns');
  assert.equal(created.body.data.status, 'missing', 'creation never accepts a status');
  assert.equal(created.body.data.workspaceId, String(ctx.workspace._id));
  assert.equal(created.body.data.source, 'custom');
  assert.equal(created.body.data._id, undefined);

  for (const bad of [{}, { title: '   ' }, { title: 'x'.repeat(201) }, { title: 'ok', importance: 'critical' }, { title: 'ok', section: '' }]) {
    const res = await post(agent, `${base(ctx.caseDoc)}/requirements`, bad);
    assert.equal(res.status, 422, JSON.stringify(bad));
  }

  const list = await agent.get(base(ctx.caseDoc));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.actions, { canManage: true });
  assert.equal(list.body.data.summary.total, 1);
  assert.equal(list.body.data.requirements[0].id, created.body.data.id);
  assert.equal(list.body.data.requirements[0].__v, undefined);
});

test('status: transitions, reasons for waived / not applicable, satisfied bookkeeping, invalid and malformed ids', async () => {
  const ctx = await seedCase();
  const { agent, user } = await staffAgent('pm', { workspace: ctx.workspace });
  const { body } = await post(agent, `${base(ctx.caseDoc)}/requirements`, { title: 'Passport' });
  const url = `/api/v1/staff/evidence/requirements/${body.data.id}/status`;
  const patch = (b) => agent.patch(url).set('Origin', ORIGIN).send(b);

  assert.equal((await patch({ status: 'in_progress' })).body.data.status, 'in_progress');

  const satisfied = await patch({ status: 'satisfied' });
  assert.equal(satisfied.body.data.status, 'satisfied');
  assert.ok(satisfied.body.data.satisfiedAt);
  const row = await EvidenceRequirement.findById(body.data.id).lean();
  assert.equal(String(row.satisfiedBy), String(user._id));

  assert.equal((await patch({ status: 'waived' })).status, 422, 'waived needs a reason');
  assert.equal((await patch({ status: 'not_applicable', reason: '   ' })).status, 422, 'blank reason is no reason');
  const waived = await patch({ status: 'waived', reason: 'Client has no such record.' });
  assert.equal(waived.status, 200);
  assert.equal(waived.body.data.waivedReason, 'Client has no such record.');
  assert.equal(waived.body.data.satisfiedAt, null, 'leaving satisfied clears bookkeeping');

  const back = await patch({ status: 'missing' });
  assert.equal(back.body.data.waivedReason, null);

  assert.equal((await patch({ status: 'done' })).status, 422);
  assert.equal((await agent.patch('/api/v1/staff/evidence/requirements/not-an-id/status').set('Origin', ORIGIN).send({ status: 'missing' })).status, 404);
});

test('summary: waived / not applicable requirements leave the required denominator', async () => {
  const ctx = await seedCase();
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });
  const ids = [];
  for (const title of ['A', 'B', 'C']) ids.push((await post(agent, `${base(ctx.caseDoc)}/requirements`, { title })).body.data.id);
  const set = (i, b) => agent.patch(`/api/v1/staff/evidence/requirements/${ids[i]}/status`).set('Origin', ORIGIN).send(b);
  await set(0, { status: 'satisfied' });
  await set(1, { status: 'waived', reason: 'n/a' });

  const { summary } = (await agent.get(base(ctx.caseDoc))).body.data;
  assert.deepEqual({ total: summary.total, requiredTotal: summary.requiredTotal, requiredSatisfied: summary.requiredSatisfied, completionPercent: summary.completionPercent }, { total: 3, requiredTotal: 2, requiredSatisfied: 1, completionPercent: 50 });
});

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

test('documents: same-case link is idempotent and shown by displayName; unlink removes; cross-case and malformed ids are rejected', async () => {
  const ctx = await seedCase();
  const other = await seedCase();
  const doc = await seedDocument(ctx, 'Degree.pdf');
  const foreign = await seedDocument(other, 'Foreign.pdf');
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });
  const { body } = await post(agent, `${base(ctx.caseDoc)}/requirements`, { title: 'Degree' });
  const docsUrl = `/api/v1/staff/evidence/requirements/${body.data.id}/documents`;

  const eligible = await agent.get(`${base(ctx.caseDoc)}/eligible-documents`);
  assert.equal(eligible.status, 200);
  assert.deepEqual(eligible.body.data.documents.map((d) => d.displayName), ['Degree.pdf'], 'only this case, never another case');

  const linked = await post(agent, docsUrl, { documentId: String(doc._id) });
  assert.equal(linked.status, 200);
  assert.deepEqual(linked.body.data.linkedDocuments, [{ id: String(doc._id), displayName: 'Degree.pdf', status: 'uploaded' }]);

  await post(agent, docsUrl, { documentId: String(doc._id) });
  assert.equal((await EvidenceRequirement.findById(body.data.id).lean()).linkedDocuments.length, 1, 'linking twice does not duplicate');

  const cross = await post(agent, docsUrl, { documentId: String(foreign._id) });
  assert.equal(cross.status, 404, 'a document of another case is concealed, not linked');
  assert.equal((await EvidenceRequirement.findById(body.data.id).lean()).linkedDocuments.length, 1);

  assert.equal((await post(agent, docsUrl, { documentId: 'nope' })).status, 422);
  assert.equal((await post(agent, docsUrl, {})).status, 422);

  const unlinked = await agent.delete(`${docsUrl}/${doc._id}`).set('Origin', ORIGIN);
  assert.equal(unlinked.status, 200);
  assert.deepEqual(unlinked.body.data.linkedDocuments, []);
  assert.equal((await agent.delete(`${docsUrl}/nope`).set('Origin', ORIGIN)).status, 422);
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

test('authorization: members manage, reviewers read only, outsiders and removed members are concealed immediately', async () => {
  const ctx = await seedCase();
  const other = await seedCase();
  await seedTemplate();
  const pm = await staffAgent('pm', { workspace: ctx.workspace });
  const reviewer = await staffAgent('reviewer', { workspace: ctx.workspace, workspaceRole: 'reviewer' });
  const outsider = await staffAgent('pm', { workspace: other.workspace });
  const admin = await staffAgent('super_admin');
  const url = base(ctx.caseDoc);

  const { body } = await post(pm.agent, `${url}/requirements`, { title: 'Passport' });
  const reqUrl = `/api/v1/staff/evidence/requirements/${body.data.id}`;

  // reviewer: can read (with canManage false) but every mutation is 403
  const read = await reviewer.agent.get(url);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.data.actions, { canManage: false });
  assert.equal((await reviewer.agent.get(`${url}/templates`)).status, 200);
  assert.equal((await post(reviewer.agent, `${url}/provision`, { templateKey: 'eb2_niw_base' })).status, 403);
  assert.equal((await post(reviewer.agent, `${url}/requirements`, { title: 'x' })).status, 403);
  assert.equal((await reviewer.agent.patch(`${reqUrl}/status`).set('Origin', ORIGIN).send({ status: 'satisfied' })).status, 403);
  assert.equal((await reviewer.agent.get(`${url}/eligible-documents`)).status, 403);

  // a PM of a different case sees nothing of this one — same 404 as a nonexistent case
  assert.equal((await outsider.agent.get(url)).status, 404);
  assert.equal((await post(outsider.agent, `${url}/requirements`, { title: 'x' })).status, 404);
  assert.equal((await outsider.agent.patch(`${reqUrl}/status`).set('Origin', ORIGIN).send({ status: 'satisfied' })).status, 404);
  const missing = await outsider.agent.get(`/api/v1/staff/cases/64b0f0f0f0f0f0f0f0f0f0f0/evidence`);
  assert.equal(missing.status, 404);
  assert.equal((await outsider.agent.get(`${url}`)).body.error.message, missing.body.error.message);
  assert.equal((await admin.agent.get(url)).status, 200);

  // removing the membership revokes access on the very next request
  assert.equal((await pm.agent.get(url)).status, 200);
  await WorkspaceMember.updateOne({ _id: pm.member._id }, { $set: { status: 'removed' } });
  assert.equal((await pm.agent.get(url)).status, 404);
  assert.equal((await post(pm.agent, `${url}/requirements`, { title: 'late' })).status, 404);
  assert.equal((await pm.agent.patch(`${reqUrl}/status`).set('Origin', ORIGIN).send({ status: 'satisfied' })).status, 404);
  assert.equal(await EvidenceRequirement.countDocuments({ case: ctx.caseDoc._id }), 1);
});

test('authorization: a case without a primary workspace and a malformed case id are plain 404s, nothing is written', async () => {
  const ctx = await seedCase();
  await CaseWorkspace.deleteMany({ case: ctx.caseDoc._id });
  const admin = await staffAgent('super_admin');

  assert.equal((await admin.agent.get(base(ctx.caseDoc))).status, 404);
  assert.equal((await post(admin.agent, `${base(ctx.caseDoc)}/requirements`, { title: 'x' })).status, 404);
  assert.equal((await admin.agent.get('/api/v1/staff/cases/not-an-id/evidence')).status, 404);
  assert.equal((await post(admin.agent, '/api/v1/staff/cases/not-an-id/evidence/provision', { templateKey: 'x' })).status, 404);
  assert.equal(await EvidenceRequirement.countDocuments({}), 0);
});

test('mutations require a trusted Origin', async () => {
  const ctx = await seedCase();
  const { agent } = await staffAgent('pm', { workspace: ctx.workspace });
  const res = await agent.post(`${base(ctx.caseDoc)}/requirements`).set('Origin', BAD_ORIGIN).send({ title: 'x' });
  assert.equal(res.status, 403);
  assert.equal(await EvidenceRequirement.countDocuments({}), 0);
});
