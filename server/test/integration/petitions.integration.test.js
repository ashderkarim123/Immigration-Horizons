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
const CaseActivity = require('../../models/CaseActivity');
const CasePetition = require('../../models/CasePetition');
const PetitionVersion = require('../../models/PetitionVersion');
const EvidenceRequirement = require('../../models/EvidenceRequirement');
const CaseSmartForm = require('../../models/CaseSmartForm');
const CaseDocument = require('../../models/CaseDocument');
const DocumentVersion = require('../../models/DocumentVersion');
const DocumentCategory = require('../../models/DocumentCategory');
const Task = require('../../models/admin/Task');
const mongoose = require('mongoose');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const CANARY = 'Zanzibar-Confidential-Argument-77';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  await Promise.all([CasePetition.init(), PetitionVersion.init()]);
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function staffAgent(role, { member = null, mustChangePassword = false } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword });
  if (member) await WorkspaceMember.create({ workspace: member._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'contributor', status: 'active' });
  const agent = request.agent(app);
  const login = await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, user };
}

async function seedCase(caseType = 'eb2_niw') {
  const client = await ClientUser.create({ email: `${unique('c')}@example.com`, normalizedEmail: `${unique('c')}@example.com`, passwordHash: 'x', firstName: 'Casey', status: 'active' });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('o')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: 'Case', caseType, primaryClient: client._id, projectManager: owner._id, createdBy: owner._id, createdByName: owner.name });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  return { client, owner, caseDoc, workspace };
}

/** Real same-case records for each dependency type, in their READY state by default. */
async function seedArtifacts({ caseDoc, workspace, owner }, overrides = {}) {
  const evidence = await EvidenceRequirement.create({ case: caseDoc._id, workspace: workspace._id, source: 'custom', title: 'Publication record', status: 'satisfied', createdBy: owner._id, ...overrides.evidence });
  const form = await CaseSmartForm.create({ case: caseDoc._id, workspace: workspace._id, template: new mongoose.Types.ObjectId(), templateKey: 'personal_contact', templateVersion: 1, templateTitleSnapshot: 'Personal & Contact Information', status: 'locked', revision: 6, lockedRevision: 6, ...overrides.form });
  const category = await DocumentCategory.create({ case: caseDoc._id, workspace: workspace._id, name: 'Work product', slug: unique('wp'), order: 1, visibility: 'employees_only', createdBy: owner._id }).catch(() => null);
  const docBase = { case: caseDoc._id, workspace: workspace._id, category: category ? category._id : new mongoose.Types.ObjectId(), uploadedByType: 'employee', uploadedByAdmin: owner._id, originalName: 'plan.pdf', displayName: 'Business plan.pdf', storageKey: 'SECRET-STORAGE-KEY-123', mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 10, checksum: 'SECRET-CHECKSUM-456', visibility: 'employees_only' };
  const doc = await CaseDocument.create({ ...docBase, status: 'accepted', reviewedBy: owner._id, reviewedAt: new Date(), ...overrides.doc });
  const version = await DocumentVersion.create({ document: doc._id, versionNumber: 3, storageKey: 'SECRET-STORAGE-KEY-123', originalName: 'plan.pdf', displayName: 'Business plan v3.pdf', mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 10, checksum: 'SECRET-CHECKSUM-456', uploadedByType: 'employee', uploadedByAdmin: owner._id });
  await CaseDocument.updateOne({ _id: doc._id }, { currentVersion: version._id, versionCount: 3 });
  const task = await Task.create({ case: caseDoc._id, title: 'Collect letters', status: 'completed', ...overrides.task });
  return { evidence, form, doc, version, task };
}

const post = (agent, url, body = {}) => agent.post(`/api/v1/staff${url}`).set('Origin', ORIGIN).send(body);
const patch = (agent, url, body = {}) => agent.patch(`/api/v1/staff${url}`).set('Origin', ORIGIN).send(body);
const get = (agent, url) => agent.get(`/api/v1/staff${url}`);
const del = (agent, url) => agent.delete(`/api/v1/staff${url}`).set('Origin', ORIGIN);

async function provision(agent, caseDoc) {
  const res = await post(agent, `/cases/${caseDoc._id}/petitions/provision`);
  assert.ok([200, 201].includes(res.status), `provision failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/** A petition driven to `approved` by a pm (who holds edit + review). Returns the latest detail. */
async function approvedPetition(agent, caseDoc) {
  let p = await provision(agent, caseDoc);
  for (const section of p.sections.filter((s) => s.required)) {
    let res = await patch(agent, `/petitions/${p.id}/sections/${section.key}`, { revision: p.revision, body: `Draft of ${section.title}` });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    res = await post(agent, `/petitions/${p.id}/sections/${section.key}/review`, { revision: res.body.data.revision });
    res = await post(agent, `/petitions/${p.id}/sections/${section.key}/approve`, { revision: res.body.data.revision });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    p = res.body.data;
  }
  let res = await post(agent, `/petitions/${p.id}/submit`, { revision: p.revision });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  res = await post(agent, `/petitions/${p.id}/approve`, { revision: res.body.data.revision });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

// ---------------------------------------------------------------------------
// Domain: provisioning, multiple petitions, versions
// ---------------------------------------------------------------------------

test('provisioning creates the case-type template once; a case can own several petitions', async () => {
  const c = await seedCase('eb2_niw');
  const { agent } = await staffAgent('pm', { member: c.workspace });

  const first = await post(agent, `/cases/${c.caseDoc._id}/petitions/provision`);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.kind, 'primary');
  assert.equal(first.body.data.sequence, 1);
  assert.equal(first.body.data.status, 'drafting');
  assert.deepEqual(first.body.data.sections.map((s) => s.key).slice(0, 2), ['case_overview', 'beneficiary_background']);
  assert.ok(first.body.data.sections.every((s) => s.body === '' && s.reviewStatus === 'draft'));

  const again = await post(agent, `/cases/${c.caseDoc._id}/petitions/provision`);
  assert.equal(again.status, 200);
  assert.equal(again.body.data.id, first.body.data.id);
  assert.equal(await CasePetition.countDocuments({ case: c.caseDoc._id }), 1);

  const rfe = await post(agent, `/cases/${c.caseDoc._id}/petitions`, { kind: 'rfe_response', title: 'RFE response' });
  assert.equal(rfe.status, 201);
  assert.equal(rfe.body.data.sequence, 2);
  assert.equal(rfe.body.data.sections[0].key, 'notice_summary');

  const list = await get(agent, `/cases/${c.caseDoc._id}/petitions`);
  assert.deepEqual(list.body.data.petitions.map((p) => p.sequence), [1, 2]);
  assert.equal(list.body.data.canProvision, true);

  await assert.rejects(() => CasePetition.create({ case: c.caseDoc._id, workspace: c.workspace._id, sequence: 2, title: 'dup' }), /duplicate key|E11000/);
});

test('a case type with no automatic petition is refused provisioning but can be created deliberately', async () => {
  const c = await seedCase('other');
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const res = await post(agent, `/cases/${c.caseDoc._id}/petitions/provision`);
  assert.equal(res.status, 400);
  assert.ok(res.body.error.fieldErrors.caseType);
  const manual = await post(agent, `/cases/${c.caseDoc._id}/petitions`, { kind: 'other', title: 'Misc work' });
  assert.equal(manual.status, 201);
  assert.deepEqual(manual.body.data.sections.map((s) => s.key), ['work_summary', 'notes']);
});

// ---------------------------------------------------------------------------
// Authorization and concealment
// ---------------------------------------------------------------------------

test('unauthenticated, password-setup, capability-less and read-only callers are refused', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const petition = await provision(pm, c.caseDoc);

  assert.equal((await request(app).get(`/api/v1/staff/petitions/${petition.id}`)).status, 401);

  const { agent: fresh } = await staffAgent('pm', { member: c.workspace, mustChangePassword: true });
  const blocked = await get(fresh, `/petitions/${petition.id}`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'password_change_required');

  const { agent: editor } = await staffAgent('editor', { member: c.workspace }); // legacy role, no petitions.*
  assert.equal((await get(editor, `/petitions/${petition.id}`)).status, 403);

  const { agent: collector } = await staffAgent('evidence_collector', { member: c.workspace }); // view only
  const view = await get(collector, `/petitions/${petition.id}`);
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.data.actions, { canManage: false, canEdit: false, canLink: false, canSubmit: false, canReturn: false, canApprove: false, canFinalize: false });
  assert.equal((await post(collector, `/cases/${c.caseDoc._id}/petitions/provision`)).status, 403);
  assert.equal((await patch(collector, `/petitions/${petition.id}/sections/case_overview`, { revision: 1, body: 'x' })).status, 403);
  assert.equal((await post(collector, `/petitions/${petition.id}/submit`, { revision: 1 })).status, 403);
});

test('no membership, removed member, other case and malformed ids are the same 404', async () => {
  const a = await seedCase();
  const b = await seedCase();
  const { agent: pmA } = await staffAgent('pm', { member: a.workspace });
  const { agent: pmB } = await staffAgent('pm', { member: b.workspace });
  const petitionA = await provision(pmA, a.caseDoc);

  assert.equal((await get(pmB, `/petitions/${petitionA.id}`)).status, 404);
  assert.equal((await get(pmB, `/cases/${a.caseDoc._id}/petitions`)).status, 404);
  assert.equal((await patch(pmB, `/petitions/${petitionA.id}/sections/case_overview`, { revision: 1, body: 'x' })).status, 404);
  assert.equal((await get(pmA, '/petitions/not-an-id')).status, 404);
  assert.equal((await get(pmA, '/petitions/64b0f0f0f0f0f0f0f0f0f0f0')).status, 404);

  const { agent: outsider, user } = await staffAgent('petition_writer');
  assert.equal((await get(outsider, `/petitions/${petitionA.id}`)).status, 404);
  const member = await WorkspaceMember.create({ workspace: a.workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'contributor', status: 'removed' });
  assert.equal((await get(outsider, `/petitions/${petitionA.id}`)).status, 404);
  await WorkspaceMember.updateOne({ _id: member._id }, { status: 'active' });
  assert.equal((await get(outsider, `/petitions/${petitionA.id}`)).status, 200);
  await WorkspaceMember.updateOne({ _id: member._id }, { status: 'removed' }); // loses access immediately
  assert.equal((await get(outsider, `/petitions/${petitionA.id}`)).status, 404);

  const { agent: admin } = await staffAgent('admin'); // org-wide, no membership
  assert.equal((await get(admin, `/petitions/${petitionA.id}`)).status, 200);
});

test('mutations without a trusted Origin are refused', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const p = await provision(agent, c.caseDoc);
  assert.equal((await agent.patch(`/api/v1/staff/petitions/${p.id}/sections/case_overview`).send({ revision: 1, body: 'x' })).status, 403);
  assert.equal((await agent.post(`/api/v1/staff/petitions/${p.id}/submit`).set('Origin', 'https://evil.example').send({ revision: 1 })).status, 403);
  assert.equal((await agent.delete(`/api/v1/staff/petitions/${p.id}/dependencies/64b0f0f0f0f0f0f0f0f0f0f0?revision=1`)).status, 403);
});

// ---------------------------------------------------------------------------
// Sections: ownership, autosave, concurrency, review
// ---------------------------------------------------------------------------

test('a writer edits only assigned sections; a manager edits any; a reviewer cannot draft', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: writer, user: writerUser } = await staffAgent('petition_writer', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  let p = await provision(pm, c.caseDoc);

  const assigned = await post(pm, `/petitions/${p.id}/sections/case_overview/assign`, { revision: p.revision, assigneeId: String(writerUser._id) });
  assert.equal(assigned.status, 200);
  p = assigned.body.data;
  assert.equal(p.sections[0].assignee.name, writerUser.name);

  const ok = await patch(writer, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'My opening.' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.sections[0].body, 'My opening.');
  assert.equal(ok.body.data.revision, p.revision + 1);

  const other = await patch(writer, `/petitions/${p.id}/sections/beneficiary_background`, { revision: ok.body.data.revision, body: 'Not mine' });
  assert.equal(other.status, 403);
  assert.match(other.body.error.message, /assigned to you/);

  const managerEdit = await patch(pm, `/petitions/${p.id}/sections/beneficiary_background`, { revision: ok.body.data.revision, body: 'Manager draft' });
  assert.equal(managerEdit.status, 200);

  const reviewerEdit = await patch(reviewer, `/petitions/${p.id}/sections/case_overview`, { revision: managerEdit.body.data.revision, body: 'x' });
  assert.equal(reviewerEdit.status, 403);
  assert.equal((await post(reviewer, `/petitions/${p.id}/sections/case_overview/assign`, { revision: 1, assigneeId: null })).status, 403);
});

test('autosave bumps the revision, an unchanged body does not, stale revisions are 409 and nothing is overwritten', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const p = await provision(agent, c.caseDoc);

  const first = await patch(agent, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'First' });
  assert.equal(first.body.data.revision, p.revision + 1);
  const same = await patch(agent, `/petitions/${p.id}/sections/case_overview`, { revision: first.body.data.revision, body: 'First' });
  assert.equal(same.status, 200);
  assert.equal(same.body.data.revision, first.body.data.revision);

  const stale = await patch(agent, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'Second' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'conflict');
  assert.equal(stale.body.error.fieldErrors.revision, first.body.data.revision);
  assert.equal((await CasePetition.findById(p.id).lean()).sections[0].body, 'First');

  assert.equal((await patch(agent, `/petitions/${p.id}/sections/case_overview`, { body: 'x' })).status, 400); // revision mandatory
  assert.equal((await patch(agent, `/petitions/${p.id}/sections/case_overview`, { revision: first.body.data.revision, body: 'x'.repeat(50001) })).status, 400);
  assert.equal((await patch(agent, `/petitions/${p.id}/sections/nope`, { revision: first.body.data.revision, body: 'x' })).status, 404);
});

test('two simultaneous saves of the same revision: exactly one wins', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const p = await provision(agent, c.caseDoc);
  const results = await Promise.all([
    patch(agent, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'A' }),
    patch(agent, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'B' }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('section review: ready needs text, return needs a note, approve needs ready, editing an approved section reopens it', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const { agent: writer, user: writerUser } = await staffAgent('petition_writer', { member: c.workspace });
  let p = await provision(pm, c.caseDoc);
  p = (await post(pm, `/petitions/${p.id}/sections/case_overview/assign`, { revision: p.revision, assigneeId: String(writerUser._id) })).body.data;

  assert.equal((await post(writer, `/petitions/${p.id}/sections/case_overview/review`, { revision: p.revision })).status, 400); // empty
  p = (await patch(writer, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'Text' })).body.data;
  assert.equal((await post(reviewer, `/petitions/${p.id}/sections/case_overview/approve`, { revision: p.revision })).status, 409); // not ready yet
  p = (await post(writer, `/petitions/${p.id}/sections/case_overview/review`, { revision: p.revision })).body.data;
  assert.equal(p.sections[0].reviewStatus, 'ready_for_review');
  assert.equal((await post(writer, `/petitions/${p.id}/sections/case_overview/approve`, { revision: p.revision })).status, 403); // a writer cannot sign off

  const noNote = await post(reviewer, `/petitions/${p.id}/sections/case_overview/return`, { revision: p.revision });
  assert.equal(noNote.status, 400);
  p = (await post(reviewer, `/petitions/${p.id}/sections/case_overview/return`, { revision: p.revision, reviewNote: 'Add the dates.' })).body.data;
  assert.equal(p.sections[0].reviewStatus, 'changes_requested');
  assert.equal(p.sections[0].reviewNote, 'Add the dates.');
  assert.equal(p.sections[0].reviewedByName, 'Staff reviewer');

  p = (await post(writer, `/petitions/${p.id}/sections/case_overview/review`, { revision: p.revision })).body.data; // resubmit
  p = (await post(reviewer, `/petitions/${p.id}/sections/case_overview/approve`, { revision: p.revision })).body.data;
  assert.equal(p.sections[0].reviewStatus, 'approved');
  assert.deepEqual(p.sectionProgress, { approved: 1, total: p.sections.filter((s) => s.required).length });

  p = (await patch(writer, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: 'Text changed after approval' })).body.data;
  assert.equal(p.sections[0].reviewStatus, 'draft', 'approved text that changed must be re-reviewed');
  assert.equal(p.sections[0].reviewedByName, '');
});

test('assignment needs an active member with a petition-capable role; it never grants access', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const p = await provision(pm, c.caseDoc);
  const { user: outsider } = await staffAgent('petition_writer'); // not on the case
  const { user: collector } = await staffAgent('evidence_collector', { member: c.workspace }); // on the case, wrong role
  const { user: inactive } = await staffAgent('petition_writer', { member: c.workspace });
  await AdminUser.updateOne({ _id: inactive._id }, { isActive: false });

  const assign = (assigneeId) => post(pm, `/petitions/${p.id}/sections/case_overview/assign`, { revision: p.revision, assigneeId });
  const notMember = await assign(String(outsider._id));
  assert.equal(notMember.status, 400);
  assert.match(notMember.body.error.fieldErrors.assigneeId, /Add this employee to the case team/);
  assert.equal((await assign(String(collector._id))).status, 400);
  assert.equal((await assign(String(inactive._id))).status, 400);
  assert.equal((await assign('not-an-id')).status, 400);
  assert.equal(await WorkspaceMember.countDocuments({ workspace: c.workspace._id, adminUser: outsider._id }), 0, 'assignment must not create membership');

  const cleared = await assign(null);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.sections[0].assignee, null);
});

// ---------------------------------------------------------------------------
// Dependencies: integrity, readiness, privacy
// ---------------------------------------------------------------------------

test('same-case artifacts link with live readiness; cross-case ids are concealed; duplicates are idempotent', async () => {
  const c = await seedCase();
  const other = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const mine = await seedArtifacts(c);
  const theirs = await seedArtifacts(other);
  let p = await provision(agent, c.caseDoc);

  const link = async (type, refId, extra = {}) => post(agent, `/petitions/${p.id}/dependencies`, { revision: p.revision, type, refId: String(refId), ...extra });
  for (const [type, ref, extra] of [
    ['evidence_requirement', mine.evidence._id, {}],
    ['smart_form', mine.form._id, {}],
    ['case_document', mine.doc._id, { role: 'business_plan' }],
    ['task', mine.task._id, { requiredForFinalization: false }],
  ]) {
    const res = await link(type, ref, extra);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    p = res.body.data;
  }
  assert.equal(p.dependencies.length, 4);
  assert.ok(p.dependencies.every((d) => d.ready), 'all four are in a ready state');
  assert.equal(p.dependencies.find((d) => d.type === 'case_document').role, 'business_plan');
  assert.deepEqual(p.dependencyProgress, { ready: 3, total: 3 }, 'only required dependencies count');

  const dup = await link('evidence_requirement', mine.evidence._id);
  assert.equal(dup.status, 201);
  assert.equal(dup.body.data.dependencies.length, 4);
  assert.equal(dup.body.data.revision, p.revision, 'a duplicate link changes nothing');

  for (const [type, ref] of [['evidence_requirement', theirs.evidence._id], ['smart_form', theirs.form._id], ['case_document', theirs.doc._id], ['task', theirs.task._id]]) {
    const res = await link(type, ref);
    assert.equal(res.status, 404, `${type} from another case must be concealed`);
  }
  assert.equal((await link('task', 'not-an-id')).status, 404);
  assert.equal((await link('widget', mine.task._id)).status, 400);
  assert.equal((await link('task', mine.task._id, { role: 'business_plan' })).status, 400); // role is document-only
  assert.equal((await link('case_document', (await seedArtifacts(c, { doc: { status: 'archived', archivedAt: new Date() }, form: { templateKey: 'spare_form' } })).doc._id)).status, 400);

  const removed = await del(agent, `/petitions/${p.id}/dependencies/${p.dependencies[0].id}?revision=${p.revision}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.dependencies.length, 3);
});

test('readiness is deterministic per type', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const art = await seedArtifacts(c, { evidence: { status: 'missing' }, form: { status: 'submitted', lockedRevision: null }, doc: { status: 'pending_review' }, task: { status: 'in_progress' } });
  let p = await provision(agent, c.caseDoc);
  for (const [type, ref] of [['evidence_requirement', art.evidence._id], ['smart_form', art.form._id], ['case_document', art.doc._id], ['task', art.task._id]]) {
    p = (await post(agent, `/petitions/${p.id}/dependencies`, { revision: p.revision, type, refId: String(ref) })).body.data;
  }
  assert.ok(p.dependencies.every((d) => !d.ready && d.reason));
  assert.deepEqual(p.dependencyProgress, { ready: 0, total: 4 });

  // Regression: the requirement's own pre-save hook used the callback form and threw on every save.
  const requirement = await EvidenceRequirement.findById(art.evidence._id);
  requirement.status = 'waived';
  requirement.waivedReason = 'Not needed';
  await requirement.save();
  await CaseSmartForm.updateOne({ _id: art.form._id }, { status: 'approved' });
  await CaseDocument.updateOne({ _id: art.doc._id }, { status: 'accepted', reviewedBy: c.owner._id, reviewedAt: new Date() });
  await Task.updateOne({ _id: art.task._id }, { status: 'completed' });
  const ready = (await get(agent, `/petitions/${p.id}`)).body.data;
  assert.ok(ready.dependencies.every((d) => d.ready), JSON.stringify(ready.dependencies));

  await CaseDocument.updateOne({ _id: art.doc._id }, { scanStatus: 'infected' });
  const infected = (await get(agent, `/petitions/${p.id}`)).body.data;
  assert.equal(infected.dependencies.find((d) => d.type === 'case_document').ready, false);
  await CaseDocument.updateOne({ _id: art.doc._id }, { scanStatus: 'clean', currentVersion: null });
  assert.equal((await get(agent, `/petitions/${p.id}`)).body.data.dependencies.find((d) => d.type === 'case_document').ready, false, 'a document with no current version is not ready');
});

test('candidate lists are same-case and bounded; DTOs never carry storage metadata', async () => {
  const c = await seedCase();
  const other = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const mine = await seedArtifacts(c);
  await seedArtifacts(other);
  let p = await provision(agent, c.caseDoc);
  p = (await post(agent, `/petitions/${p.id}/dependencies`, { revision: p.revision, type: 'case_document', refId: String(mine.doc._id) })).body.data;

  for (const type of ['evidence_requirement', 'smart_form', 'case_document', 'task']) {
    const res = await get(agent, `/petitions/${p.id}/dependency-candidates?type=${type}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.candidates.length, 1, `${type} lists only this case's record`);
  }
  assert.equal((await get(agent, `/petitions/${p.id}/dependency-candidates?type=case_document`)).body.data.candidates[0].linked, true);
  assert.equal((await get(agent, `/petitions/${p.id}/dependency-candidates?type=nope`)).status, 400);

  const everything = JSON.stringify([(await get(agent, `/petitions/${p.id}`)).body, (await get(agent, `/petitions/${p.id}/dependency-candidates?type=case_document`)).body]);
  for (const secret of ['SECRET-STORAGE-KEY-123', 'SECRET-CHECKSUM-456', 'storageKey', 'checksum', 'passwordHash', 'tokenHash']) {
    assert.equal(everything.includes(secret), false, `${secret} leaked into a petition DTO`);
  }
});

// ---------------------------------------------------------------------------
// Lifecycle and immutable versions
// ---------------------------------------------------------------------------

test('submit and approve need the right section states; return reopens; approval writes a version', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  let p = await provision(pm, c.caseDoc);

  const early = await post(pm, `/petitions/${p.id}/submit`, { revision: p.revision });
  assert.equal(early.status, 400);
  assert.ok(early.body.error.fieldErrors.case_overview);

  p = await approvedPetition(pm, c.caseDoc);
  assert.equal(p.status, 'approved');
  assert.equal(p.versions.length, 1);
  assert.equal(p.versions[0].reason, 'approval');
  assert.equal(p.versions[0].versionNumber, 1);

  const noNote = await post(reviewer, `/petitions/${p.id}/return`, { revision: p.revision });
  assert.equal(noNote.status, 400);
  const returned = await post(reviewer, `/petitions/${p.id}/return`, { revision: p.revision, internalReviewNote: 'Re-check the evidence section.' });
  assert.equal(returned.status, 200);
  assert.equal(returned.body.data.status, 'needs_changes');
  assert.equal(returned.body.data.internalReviewNote, 'Re-check the evidence section.');

  assert.equal((await post(pm, `/petitions/${p.id}/approve`, { revision: returned.body.data.revision })).status, 409); // approve needs internal_review
  assert.equal((await post(pm, `/petitions/${p.id}/finalize`, { revision: returned.body.data.revision })).status, 403); // pm lacks finalize
});

test('finalize needs approved, finalize permission, approved sections and ready required dependencies; it freezes provenance', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const art = await seedArtifacts(c, { evidence: { status: 'missing' }, task: { status: 'in_progress' } });
  let p = await approvedPetition(pm, c.caseDoc);

  const link = async (type, ref, extra = {}) => {
    const res = await post(pm, `/petitions/${p.id}/dependencies`, { revision: p.revision, type, refId: String(ref), ...extra });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    p = res.body.data;
  };
  await link('evidence_requirement', art.evidence._id); // required, NOT ready
  await link('smart_form', art.form._id);
  await link('case_document', art.doc._id, { role: 'business_plan' });
  await link('task', art.task._id, { requiredForFinalization: false }); // optional, not ready

  const blocked = await post(reviewer, `/petitions/${p.id}/finalize`, { revision: p.revision });
  assert.equal(blocked.status, 400);
  assert.deepEqual(Object.keys(blocked.body.error.fieldErrors), [`dependency:${p.dependencies[0].id}`], 'only the required unready dependency blocks');
  assert.equal((await CasePetition.findById(p.id).lean()).status, 'approved');
  assert.equal(await PetitionVersion.countDocuments({ petition: p.id, reason: 'finalization' }), 0);

  await EvidenceRequirement.updateOne({ _id: art.evidence._id }, { status: 'satisfied' });
  const final = await post(reviewer, `/petitions/${p.id}/finalize`, { revision: p.revision });
  assert.equal(final.status, 200, JSON.stringify(final.body));
  assert.equal(final.body.data.status, 'finalized');
  assert.deepEqual(final.body.data.actions, { canManage: false, canEdit: false, canLink: false, canSubmit: false, canReturn: false, canApprove: false, canFinalize: false });
  assert.equal(final.body.data.versions[0].reason, 'finalization');
  assert.equal(final.body.data.versions[0].versionNumber, 2);

  const version = await get(pm, `/petitions/${p.id}/versions/${final.body.data.versions[0].id}`);
  assert.equal(version.status, 200);
  const byType = Object.fromEntries(version.body.data.dependencies.map((d) => [d.type, d]));
  assert.equal(byType.smart_form.provenance.revision, 6);
  assert.equal(byType.smart_form.provenance.lockedRevision, 6);
  assert.equal(byType.smart_form.provenance.templateKey, 'personal_contact');
  assert.equal(String(byType.case_document.provenance.documentVersionId), String(art.version._id));
  assert.equal(byType.case_document.provenance.versionNumber, 3);
  assert.equal(byType.case_document.provenance.displayName, 'Business plan v3.pdf');
  assert.equal(byType.evidence_requirement.provenance.status, 'satisfied');
  assert.equal(byType.task.ready, false);
  assert.equal(byType.task.requiredForFinalization, false);
  assert.ok(version.body.data.sections.every((s) => s.reviewStatus === 'approved' || !s.required));
  const dump = JSON.stringify(version.body);
  for (const secret of ['SECRET-STORAGE-KEY-123', 'SECRET-CHECKSUM-456']) assert.equal(dump.includes(secret), false);

  // The snapshot does not move when the live records do.
  await CaseDocument.updateOne({ _id: art.doc._id }, { displayName: 'Renamed later' });
  await CaseSmartForm.updateOne({ _id: art.form._id }, { revision: 99 });
  const again = (await get(pm, `/petitions/${p.id}/versions/${final.body.data.versions[0].id}`)).body.data;
  assert.equal(again.dependencies.find((d) => d.type === 'case_document').provenance.displayName, 'Business plan v3.pdf');
  assert.equal(again.dependencies.find((d) => d.type === 'smart_form').provenance.revision, 6);
});

test('a finalized petition rejects every mutation; versions refuse update and delete', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: admin } = await staffAgent('admin');
  const p = await approvedPetition(pm, c.caseDoc);
  const final = (await post(admin, `/petitions/${p.id}/finalize`, { revision: p.revision })).body.data;
  assert.equal(final.status, 'finalized');
  const r = final.revision;
  const art = await seedArtifacts(c);

  for (const res of [
    await patch(admin, `/petitions/${p.id}/sections/case_overview`, { revision: r, body: 'tamper' }),
    await patch(admin, `/petitions/${p.id}`, { revision: r, title: 'tamper' }),
    await post(admin, `/petitions/${p.id}/sections/case_overview/assign`, { revision: r, assigneeId: null }),
    await post(admin, `/petitions/${p.id}/dependencies`, { revision: r, type: 'task', refId: String(art.task._id) }),
    await post(admin, `/petitions/${p.id}/submit`, { revision: r }),
    await post(admin, `/petitions/${p.id}/return`, { revision: r, internalReviewNote: 'x' }),
    await post(admin, `/petitions/${p.id}/approve`, { revision: r }),
    await post(admin, `/petitions/${p.id}/finalize`, { revision: r }),
  ]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_state');
  }
  assert.equal((await CasePetition.findById(p.id).lean()).sections[0].body, `Draft of ${final.sections[0].title}`);

  const version = await PetitionVersion.findOne({ petition: p.id });
  await assert.rejects(() => PetitionVersion.updateOne({ _id: version._id }, { titleSnapshot: 'x' }), /immutable/);
  await assert.rejects(() => PetitionVersion.deleteMany({}), /immutable/);
  version.titleSnapshot = 'x';
  await assert.rejects(() => version.save(), /immutable/);
  assert.equal((await del(admin, `/petitions/${p.id}`)).status, 404, 'there is no petition delete route');
});

test('if the snapshot cannot be written, finalization is not reported and the status is put back', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: admin } = await staffAgent('admin');
  const p = await approvedPetition(pm, c.caseDoc);

  const original = PetitionVersion.create;
  PetitionVersion.create = async () => {
    throw new Error('disk full');
  };
  let res;
  try {
    res = await post(admin, `/petitions/${p.id}/finalize`, { revision: p.revision });
  } finally {
    PetitionVersion.create = original;
  }
  assert.equal(res.status, 409);
  assert.notEqual((await CasePetition.findById(p.id).lean()).status, 'finalized');
  assert.equal((await CasePetition.findById(p.id).lean()).status, 'approved');
  assert.equal(await CaseActivity.countDocuments({ case: c.caseDoc._id, type: 'petition_finalized' }), 0);

  const retry = await post(admin, `/petitions/${p.id}/finalize`, { revision: (await CasePetition.findById(p.id).lean()).revision });
  assert.equal(retry.status, 200);
});

test('case activity records the milestones without any petition text; autosave adds none', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: admin } = await staffAgent('admin');
  let p = await provision(pm, c.caseDoc);
  p = (await patch(pm, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: CANARY })).body.data;
  await patch(pm, `/petitions/${p.id}/sections/case_overview`, { revision: p.revision, body: `${CANARY} more` });
  const before = await CaseActivity.countDocuments({ case: c.caseDoc._id, type: /^petition_/ });
  assert.equal(before, 1, 'only petition_created so far — autosave writes no activity');

  const done = await approvedPetition(pm, c.caseDoc);
  await post(admin, `/petitions/${done.id}/finalize`, { revision: done.revision });
  const types = (await CaseActivity.find({ case: c.caseDoc._id, type: /^petition_/ }).sort({ createdAt: 1 }).lean()).map((a) => a.type);
  assert.deepEqual(types, ['petition_created', 'petition_submitted', 'petition_approved', 'petition_finalized']);
  assert.equal(JSON.stringify(await CaseActivity.find({ case: c.caseDoc._id }).lean()).includes(CANARY), false, 'petition text must never reach CaseActivity');
});

test('versions list newest first with numbering that never repeats', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  let p = await approvedPetition(pm, c.caseDoc); // version 1
  p = (await post(reviewer, `/petitions/${p.id}/return`, { revision: p.revision, internalReviewNote: 'again' })).body.data;
  p = (await post(pm, `/petitions/${p.id}/submit`, { revision: p.revision })).body.data;
  p = (await post(reviewer, `/petitions/${p.id}/approve`, { revision: p.revision })).body.data; // version 2
  const list = await get(pm, `/petitions/${p.id}/versions`);
  assert.deepEqual(list.body.data.versions.map((v) => v.versionNumber), [2, 1]);
  assert.equal((await get(pm, `/petitions/${p.id}/versions/64b0f0f0f0f0f0f0f0f0f0f0`)).status, 404);
  assert.equal((await get(pm, `/petitions/${p.id}/versions/not-an-id`)).status, 404);
});
