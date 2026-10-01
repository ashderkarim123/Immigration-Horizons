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
const CaseSmartForm = require('../../models/CaseSmartForm');
const SmartFormAudit = require('../../models/SmartFormAudit');
const SmartFormTemplate = require('../../models/SmartFormTemplate');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const SECRET_ANSWER = 'Zanzibar-Secret-Street-77';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  await Promise.all([CaseSmartForm.init(), SmartFormAudit.init(), SmartFormTemplate.init()]);
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function staffAgent(role, { member = null, mustChangePassword = false } = {}) {
  const email = `${unique(role)}@ih.test`;
  const user = await AdminUser.create({ name: `Staff ${role}`, email, password: PASSWORD, role, isActive: true, mustChangePassword });
  if (member) {
    await WorkspaceMember.create({ workspace: member._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'project_manager', status: 'active' });
  }
  const agent = request.agent(app);
  const login = await agent.post('/api/v1/staff/session/login').set('Origin', ORIGIN).send({ email, password: PASSWORD });
  assert.equal(login.status, 200);
  return { agent, user };
}

async function seedCase(caseType = 'other') {
  const client = await ClientUser.create({
    email: `${unique('client')}@example.com`,
    normalizedEmail: `${unique('client')}@example.com`,
    passwordHash: 'x',
    firstName: 'Casey',
    lastName: 'Rivera',
    status: 'active',
  });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('owner')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType,
    primaryClient: client._id,
    projectManager: owner._id,
    createdBy: owner._id,
    createdByName: owner.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  return { client, caseDoc, workspace };
}

const post = (agent, url, body = {}) => agent.post(`/api/v1/staff${url}`).set('Origin', ORIGIN).send(body);
const patch = (agent, url, body = {}) => agent.patch(`/api/v1/staff${url}`).set('Origin', ORIGIN).send(body);

async function provision(agent, caseDoc) {
  const res = await post(agent, `/cases/${caseDoc._id}/forms/provision`);
  assert.ok([200, 201].includes(res.status), `provision failed: ${res.status}`);
  return res.body.data;
}

const personalForm = async (agent, caseDoc) => {
  const { forms } = await provision(agent, caseDoc);
  return forms.find((f) => f.templateKey === 'personal_contact');
};

const COMPLETE = {
  given_name: 'Casey',
  family_name: 'Rivera',
  date_of_birth: '1990-04-12',
  country_of_birth: 'pk',
  country_of_citizenship: 'PK',
  email: 'casey@example.com',
  current_address: { line1: SECRET_ANSWER, city: 'Austin', country: 'us' },
};

/** A fully-answered, submittable personal_contact form; returns its latest DTO. */
async function filledForm(agent, caseDoc) {
  const form = await personalForm(agent, caseDoc);
  const saved = await patch(agent, `/forms/${form.id}/answers`, { revision: form.revision, answers: COMPLETE });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return saved.body.data;
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

test('provisioning creates the eligible forms once, prefills deterministically, and is idempotent', async () => {
  const { caseDoc, workspace } = await seedCase('other');
  const { agent } = await staffAgent('pm', { member: workspace });

  const first = await post(agent, `/cases/${caseDoc._id}/forms/provision`);
  assert.equal(first.status, 201);
  assert.deepEqual([...first.body.data.created].sort(), ['immigration_travel_history', 'intake_other', 'personal_contact']);

  const personal = first.body.data.forms.find((f) => f.templateKey === 'personal_contact');
  const detail = await agent.get(`/api/v1/staff/forms/${personal.id}`);
  assert.equal(detail.body.data.answers.given_name, 'Casey');
  assert.equal(detail.body.data.answers.family_name, 'Rivera');
  assert.equal(detail.body.data.answers.email.endsWith('@example.com'), true);
  assert.equal(detail.body.data.status, 'draft');
  assert.equal(detail.body.data.revision, 1);

  // A client edit must not be clobbered by a second provision (prefill is a snapshot, not a binding).
  await patch(agent, `/forms/${personal.id}/answers`, { revision: 1, answers: { given_name: 'Edited' } });
  const second = await post(agent, `/cases/${caseDoc._id}/forms/provision`);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.data.created, []);
  assert.equal(await CaseSmartForm.countDocuments({ case: caseDoc._id }), 3);
  const after = await agent.get(`/api/v1/staff/forms/${personal.id}`);
  assert.equal(after.body.data.answers.given_name, 'Edited');
});

test('only intake templates for the case type are provisioned', async () => {
  const { caseDoc, workspace } = await seedCase('eb2_niw');
  const { agent } = await staffAgent('pm', { member: workspace });
  const { created } = await provision(agent, caseDoc);
  assert.ok(created.includes('intake_eb2_niw'));
  assert.ok(!created.includes('intake_eb1a'));
});

test('a published template is immutable', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  await provision(agent, caseDoc);
  const template = await SmartFormTemplate.findOne({ key: 'personal_contact' });
  template.sections[0].title = 'Changed';
  template.markModified('sections');
  await assert.rejects(() => template.save(), /immutable/);
});

// ---------------------------------------------------------------------------
// Authorization and concealment
// ---------------------------------------------------------------------------

test('unauthenticated, password-setup, and capability-less callers are refused', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(pm, caseDoc);

  assert.equal((await request(app).get(`/api/v1/staff/cases/${caseDoc._id}/forms`)).status, 401);
  assert.equal((await request(app).get(`/api/v1/staff/forms/${form.id}`)).status, 401);

  const { agent: fresh } = await staffAgent('pm', { member: workspace, mustChangePassword: true });
  const blocked = await fresh.get(`/api/v1/staff/forms/${form.id}`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'password_change_required');

  const { agent: editor } = await staffAgent('editor', { member: workspace }); // legacy role, no forms.* capability
  assert.equal((await editor.get(`/api/v1/staff/forms/${form.id}`)).status, 403);
  assert.equal((await editor.get(`/api/v1/staff/cases/${caseDoc._id}/forms`)).status, 403);
});

test('without active membership a form and its case are the same 404 as a missing one', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(pm, caseDoc);

  const { agent: outsider, user } = await staffAgent('pm'); // right role, not on this case
  const missing = '64b0f0f0f0f0f0f0f0f0f0f0';
  for (const res of [
    await outsider.get(`/api/v1/staff/cases/${caseDoc._id}/forms`),
    await outsider.get(`/api/v1/staff/forms/${form.id}`),
    await outsider.get(`/api/v1/staff/forms/${form.id}/audit`),
    await patch(outsider, `/forms/${form.id}/answers`, { revision: 1, answers: { given_name: 'x' } }),
    await post(outsider, `/forms/${form.id}/submit`, { revision: 1 }),
  ]) {
    assert.equal(res.status, 404);
  }
  const reference = await outsider.get(`/api/v1/staff/forms/${missing}`);
  assert.equal(reference.status, 404);
  assert.equal((await outsider.get('/api/v1/staff/forms/not-an-id')).status, 404);

  // A removed or suspended member loses access at once.
  const member = await WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'contributor', status: 'removed' });
  assert.equal((await outsider.get(`/api/v1/staff/forms/${form.id}`)).status, 404);
  await WorkspaceMember.updateOne({ _id: member._id }, { status: 'active' });
  assert.equal((await outsider.get(`/api/v1/staff/forms/${form.id}`)).status, 200);
});

test('a member of one case cannot reach another case’s forms', async () => {
  const a = await seedCase();
  const b = await seedCase();
  const { agent: pmA } = await staffAgent('pm', { member: a.workspace });
  const { agent: pmB } = await staffAgent('pm', { member: b.workspace });
  const formB = await personalForm(pmB, b.caseDoc);
  assert.equal((await pmA.get(`/api/v1/staff/forms/${formB.id}`)).status, 404);
  assert.equal((await pmA.get(`/api/v1/staff/cases/${b.caseDoc._id}/forms`)).status, 404);
});

test('org-wide admins reach forms without membership; a read-only role can view but not edit', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(pm, caseDoc);

  const { agent: admin } = await staffAgent('admin');
  assert.equal((await admin.get(`/api/v1/staff/forms/${form.id}`)).status, 200);

  const { agent: evidence } = await staffAgent('evidence_collector', { member: workspace }); // forms.view only
  const view = await evidence.get(`/api/v1/staff/forms/${form.id}`);
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.data.actions, { canEdit: false, canSubmit: false, canReturn: false, canApprove: false, canLock: false });
  assert.equal((await patch(evidence, `/forms/${form.id}/answers`, { revision: 1, answers: { given_name: 'x' } })).status, 403);
  assert.equal((await post(evidence, `/cases/${caseDoc._id}/forms/provision`)).status, 403);
});

test('mutations without a trusted Origin are refused', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);
  const noOrigin = await agent.patch(`/api/v1/staff/forms/${form.id}/answers`).send({ revision: 1, answers: { given_name: 'x' } });
  assert.equal(noOrigin.status, 403);
  const evil = await agent.post(`/api/v1/staff/forms/${form.id}/submit`).set('Origin', 'https://evil.example').send({ revision: 1 });
  assert.equal(evil.status, 403);
});

// ---------------------------------------------------------------------------
// Saving, validation, concurrency
// ---------------------------------------------------------------------------

test('saving normalises, bumps the revision, updates progress and audits keys only', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent, user } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);

  const res = await patch(agent, `/forms/${form.id}/answers`, { revision: form.revision, answers: COMPLETE });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.revision, 2);
  assert.equal(res.body.data.answers.country_of_birth, 'PK');
  assert.equal(res.body.data.answers.current_address.country, 'US');
  assert.deepEqual(res.body.data.progress, { completedRequired: 7, totalRequired: 7, percent: 100 });
  assert.equal(res.body.data.lastSavedByName, user.name);

  const audits = await SmartFormAudit.find({ caseSmartForm: form.id, eventType: 'answers_saved' }).lean();
  assert.equal(audits.length, 1);
  assert.ok(audits[0].changedFieldKeys.includes('current_address'));
  assert.equal(JSON.stringify(audits).includes(SECRET_ANSWER), false, 'audit rows must not hold answer values');
});

test('an invalid patch is a 400 with field errors and writes nothing', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);

  const res = await patch(agent, `/forms/${form.id}/answers`, { revision: form.revision, answers: { date_of_birth: '2023-02-30', ghost_field: 'x' } });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.fieldErrors.date_of_birth);
  assert.ok(res.body.error.fieldErrors.ghost_field);
  const stored = await CaseSmartForm.findById(form.id).lean();
  assert.equal(stored.revision, 1);
  assert.equal(await SmartFormAudit.countDocuments({ eventType: 'answers_saved' }), 0);
  assert.equal((await patch(agent, `/forms/${form.id}/answers`, { answers: { given_name: 'x' } })).status, 400); // revision is mandatory
});

test('a stale revision is a controlled 409 carrying the current revision, and never overwrites', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);

  assert.equal((await patch(agent, `/forms/${form.id}/answers`, { revision: 1, answers: { given_name: 'First' } })).status, 200);
  const stale = await patch(agent, `/forms/${form.id}/answers`, { revision: 1, answers: { given_name: 'Second' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'conflict');
  assert.equal(stale.body.error.fieldErrors.revision, 2);
  assert.equal((await CaseSmartForm.findById(form.id).lean()).answers.given_name, 'First');
});

test('two simultaneous saves of the same revision: exactly one wins', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);

  const results = await Promise.all([
    patch(agent, `/forms/${form.id}/answers`, { revision: 1, answers: { given_name: 'A' } }),
    patch(agent, `/forms/${form.id}/answers`, { revision: 1, answers: { given_name: 'B' } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await CaseSmartForm.findById(form.id).lean()).revision, 2);
});

test('staff can write staff-only fields, and a hidden answer is kept but never blocks submit', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const filled = await filledForm(agent, caseDoc);

  const note = await patch(agent, `/forms/${filled.id}/answers`, { revision: filled.revision, answers: { staff_identity_notes: 'Passport checked' } });
  assert.equal(note.status, 200);

  const hidden = await patch(agent, `/forms/${filled.id}/answers`, { revision: note.body.data.revision, answers: { mailing_address_differs: false, mailing_address: { line1: 'old' } } });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.data.answers.mailing_address.line1, 'old');
  assert.equal((await post(agent, `/forms/${filled.id}/submit`, { revision: hidden.body.data.revision })).status, 200);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('full lifecycle: submit -> return -> resubmit -> approve -> lock, with audit and a PII-free activity trail', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: workspace });
  const filled = await filledForm(pm, caseDoc);
  const id = filled.id;

  const submitted = await post(pm, `/forms/${id}/submit`, { revision: filled.revision });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.status, 'submitted');

  const noNote = await post(pm, `/forms/${id}/return`, { revision: submitted.body.data.revision });
  assert.equal(noNote.status, 400);
  assert.ok(noNote.body.error.fieldErrors.clientReviewNote);

  const returned = await post(pm, `/forms/${id}/return`, { revision: submitted.body.data.revision, clientReviewNote: 'Please confirm your birth country.', internalReviewNote: 'Check passport scan' });
  assert.equal(returned.status, 200);
  assert.equal(returned.body.data.status, 'needs_changes');
  assert.equal(returned.body.data.clientReviewNote, 'Please confirm your birth country.');
  assert.equal(returned.body.data.internalReviewNote, 'Check passport scan');

  // approve is illegal from needs_changes
  const early = await post(pm, `/forms/${id}/approve`, { revision: returned.body.data.revision });
  assert.equal(early.status, 409);
  assert.equal(early.body.error.code, 'invalid_state');

  const resubmitted = await post(pm, `/forms/${id}/submit`, { revision: returned.body.data.revision });
  assert.equal(resubmitted.status, 200);

  const approved = await post(pm, `/forms/${id}/approve`, { revision: resubmitted.body.data.revision });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.status, 'approved');
  assert.equal(approved.body.data.clientReviewNote, '');

  // locking needs forms.lock — a pm has forms.review but not forms.lock
  assert.equal((await post(pm, `/forms/${id}/lock`, { revision: approved.body.data.revision })).status, 403);
  const locked = await post(reviewer, `/forms/${id}/lock`, { revision: approved.body.data.revision });
  assert.equal(locked.status, 200);
  assert.equal(locked.body.data.status, 'locked');
  assert.equal(locked.body.data.lockedRevision, locked.body.data.revision);
  assert.equal(locked.body.data.actions.canEdit, false);

  // locked is immutable for everyone, and cannot be returned or re-locked
  const edit = await patch(pm, `/forms/${id}/answers`, { revision: locked.body.data.revision, answers: { given_name: 'Tamper' } });
  assert.equal(edit.status, 409);
  assert.equal(edit.body.error.code, 'invalid_state');
  assert.equal((await post(pm, `/forms/${id}/return`, { revision: locked.body.data.revision, clientReviewNote: 'x' })).status, 409);
  assert.equal((await post(reviewer, `/forms/${id}/lock`, { revision: locked.body.data.revision })).status, 409);
  assert.equal((await CaseSmartForm.findById(id).lean()).answers.given_name, 'Casey');

  const audit = await pm.get(`/api/v1/staff/forms/${id}/audit`);
  assert.equal(audit.status, 200);
  const events = audit.body.data.events.map((e) => e.eventType).reverse();
  assert.deepEqual(events.filter((e) => e !== 'answers_saved'), ['form_provisioned', 'submitted', 'returned_for_changes', 'submitted', 'approved', 'locked']);
  assert.equal(JSON.stringify(audit.body).includes(SECRET_ANSWER), false);
  assert.equal(JSON.stringify(audit.body).includes('Check passport scan'), false, 'review notes are not copied into the audit trail');

  const activity = await CaseActivity.find({ case: caseDoc._id, type: /^form_/ }).lean();
  assert.deepEqual([...new Set(activity.map((a) => a.type))].sort(), ['form_approved', 'form_locked', 'form_provisioned', 'form_returned', 'form_submitted']);
  const everything = JSON.stringify(activity);
  assert.equal(everything.includes(SECRET_ANSWER), false, 'case activity must not carry answers');
  assert.equal(everything.includes('Please confirm'), false);
});

test('submit and approve run the authoritative validation: an incomplete form never leaves draft', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);

  const res = await post(agent, `/forms/${form.id}/submit`, { revision: form.revision });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.fieldErrors.date_of_birth);
  assert.ok(res.body.error.fieldErrors.current_address);
  assert.equal((await CaseSmartForm.findById(form.id).lean()).status, 'draft');
  assert.equal(res.body.error.fieldErrors.staff_identity_notes, undefined, 'staff-only fields never block');
});

test('staff may edit a submitted form but a stale transition is a conflict', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const filled = await filledForm(agent, caseDoc);
  const submitted = await post(agent, `/forms/${filled.id}/submit`, { revision: filled.revision });

  const edit = await patch(agent, `/forms/${filled.id}/answers`, { revision: submitted.body.data.revision, answers: { phone: '+1 512 555 0100' } });
  assert.equal(edit.status, 200);
  // approve using the pre-edit revision: the form changed underneath the reviewer
  const stale = await post(agent, `/forms/${filled.id}/approve`, { revision: submitted.body.data.revision });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'conflict');
});

test('the audit log is append-only at the model layer', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { agent } = await staffAgent('pm', { member: workspace });
  const form = await personalForm(agent, caseDoc);
  const row = await SmartFormAudit.findOne({ caseSmartForm: form.id });
  await assert.rejects(() => SmartFormAudit.updateOne({ _id: row._id }, { actorName: 'x' }), /append-only/);
  await assert.rejects(() => SmartFormAudit.deleteMany({}), /append-only/);
  row.actorName = 'x';
  await assert.rejects(() => row.save(), /append-only/);
});
