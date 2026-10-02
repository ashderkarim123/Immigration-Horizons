process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

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
const CaseActivity = require('../../models/CaseActivity');
const CaseSmartForm = require('../../models/CaseSmartForm');
const CaseDocument = require('../../models/CaseDocument');
const DocumentVersion = require('../../models/DocumentVersion');
const DocumentCategory = require('../../models/DocumentCategory');
const PetitionVersion = require('../../models/PetitionVersion');
const FilingPacket = require('../../models/FilingPacket');
const FilingPacketVersion = require('../../models/FilingPacketVersion');
const { computeManifestHash } = require('../../services/filingPacketManagement');

const ORIGIN = 'http://localhost:4000';
const PASSWORD = 'Password123!';
const CANARY = 'Confidential-Filename-Zanzibar-77.pdf';

let app;
let seq = 0;
const unique = (label) => `${label}-${Date.now()}-${(seq += 1)}`;

test.before(async () => {
  await startTestDb();
  await Promise.all([FilingPacket.init(), FilingPacketVersion.init()]);
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

async function seedCase() {
  const client = await ClientUser.create({ email: `${unique('c')}@example.com`, normalizedEmail: `${unique('c')}@example.com`, passwordHash: 'x', firstName: 'Casey', status: 'active' });
  const owner = await AdminUser.create({ name: 'Owner', email: `${unique('o')}@ih.test`, password: PASSWORD, role: 'pm' });
  const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: 'Case', caseType: 'eb2_niw', primaryClient: client._id, projectManager: owner._id, createdBy: owner._id, createdByName: owner.name });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: owner._id, createdByName: owner.name });
  const category = await DocumentCategory.create({ case: caseDoc._id, workspace: workspace._id, name: 'USCIS Forms', slug: unique('forms'), order: 1, visibility: 'employees_only', allowedUploaderTypes: 'employee', createdBy: owner._id });
  return { client, owner, caseDoc, workspace, category };
}

const finalizedPetitionVersion = (c, overrides = {}) =>
  PetitionVersion.create({ petition: new mongoose.Types.ObjectId(), case: c.caseDoc._id, workspace: c.workspace._id, versionNumber: 2, reason: 'finalization', sourceRevision: 9, kind: 'primary', titleSnapshot: 'EB-2 NIW — Petition', statusSnapshot: 'finalized', sections: [], dependencies: [], ...overrides });

/** An accepted document with `versions` versions; the last one is the current version. */
async function seedDocument(c, { name = 'I-140 form.pdf', versions = 1, ...docOverrides } = {}) {
  const doc = await CaseDocument.create({
    case: c.caseDoc._id,
    workspace: c.workspace._id,
    category: c.category._id,
    uploadedByType: 'employee',
    uploadedByAdmin: c.owner._id,
    originalName: name,
    displayName: name,
    storageKey: 'SECRET-STORAGE-KEY-123',
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: 'pdf',
    size: 2048,
    checksum: 'SECRET-CHECKSUM-456',
    visibility: 'employees_only',
    status: 'accepted',
    reviewedBy: c.owner._id,
    reviewedAt: new Date(),
    ...docOverrides,
  });
  const made = [];
  for (let n = 1; n <= versions; n += 1) {
    made.push(await DocumentVersion.create({ document: doc._id, versionNumber: n, storageKey: 'SECRET-STORAGE-KEY-123', originalName: name, displayName: `${name.replace('.pdf', '')} v${n}.pdf`, mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 2048, checksum: 'SECRET-CHECKSUM-456', uploadedByType: 'employee', uploadedByAdmin: c.owner._id }));
  }
  await CaseDocument.updateOne({ _id: doc._id }, { currentVersion: made[made.length - 1]._id, versionCount: versions });
  return { doc, versions: made };
}

const seedForm = (c, overrides = {}) =>
  CaseSmartForm.create({ case: c.caseDoc._id, workspace: c.workspace._id, template: new mongoose.Types.ObjectId(), templateKey: unique('form'), templateVersion: 1, templateTitleSnapshot: 'Personal & Contact Information', status: 'locked', revision: 6, lockedRevision: 6, ...overrides });

const post = (agent, url, body = {}) => agent.post(`/api/v1/staff${url}`).set('Origin', ORIGIN).send(body);
const patch = (agent, url, body = {}) => agent.patch(`/api/v1/staff${url}`).set('Origin', ORIGIN).send(body);
const get = (agent, url) => agent.get(`/api/v1/staff${url}`);
const del = (agent, url) => agent.delete(`/api/v1/staff${url}`).set('Origin', ORIGIN);

async function provision(agent, caseDoc) {
  const res = await post(agent, `/cases/${caseDoc._id}/filing-packets/provision`);
  assert.ok([200, 201].includes(res.status), `provision failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/** Calls an endpoint that returns the packet detail and returns that detail (asserting success). */
async function ok(promise, status = 200) {
  const res = await promise;
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body.data;
}

/** A packet driven to `approved`: petition source, one accepted document, one locked form. */
async function approvedPacket(pm, reviewer, c, art) {
  let p = await provision(pm, c.caseDoc);
  p = await ok(post(pm, `/filing-packets/${p.id}/petition-version`, { revision: p.revision, petitionVersionId: String(art.petitionVersion._id) }));
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(art.doc._id), versionId: String(art.version._id), role: 'uscis_form' }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'smart_form_reference', smartFormId: String(art.form._id), required: false }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/submit`, { revision: p.revision }));
  return ok(post(reviewer, `/filing-packets/${p.id}/approve`, { revision: p.revision }));
}

async function seedArtifacts(c) {
  const petitionVersion = await finalizedPetitionVersion(c);
  const { doc, versions } = await seedDocument(c, { name: CANARY });
  const form = await seedForm(c);
  return { petitionVersion, doc, version: versions[0], form };
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

test('provisioning creates the initial packet once; a case may own several packets', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });

  const first = await post(agent, `/cases/${c.caseDoc._id}/filing-packets/provision`);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.kind, 'initial_filing');
  assert.equal(first.body.data.sequence, 1);
  assert.equal(first.body.data.status, 'draft');
  assert.equal(first.body.data.itemCount, 0);
  assert.equal(first.body.data.petitionSource.required, true);

  const again = await post(agent, `/cases/${c.caseDoc._id}/filing-packets/provision`);
  assert.equal(again.status, 200);
  assert.equal(again.body.data.id, first.body.data.id);
  assert.equal(await FilingPacket.countDocuments({ case: c.caseDoc._id }), 1);

  const rfe = await post(agent, `/cases/${c.caseDoc._id}/filing-packets`, { kind: 'rfe_response', title: 'RFE response packet' });
  assert.equal(rfe.status, 201);
  assert.equal(rfe.body.data.sequence, 2);
  assert.equal((await post(agent, `/cases/${c.caseDoc._id}/filing-packets`, { kind: 'bogus' })).status, 400);

  const list = await get(agent, `/cases/${c.caseDoc._id}/filing-packets`);
  assert.deepEqual(list.body.data.packets.map((p) => p.sequence), [1, 2]);
  assert.equal(list.body.data.canProvision, true);
  await assert.rejects(() => FilingPacket.create({ case: c.caseDoc._id, workspace: c.workspace._id, sequence: 2, title: 'dup' }), /duplicate key|E11000/);
});

// ---------------------------------------------------------------------------
// Authorization and concealment
// ---------------------------------------------------------------------------

test('unauthenticated, password-setup, capability-less and read-only callers are refused', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const p = await provision(pm, c.caseDoc);

  assert.equal((await request(app).get(`/api/v1/staff/filing-packets/${p.id}`)).status, 401);
  const { agent: fresh } = await staffAgent('pm', { member: c.workspace, mustChangePassword: true });
  const blocked = await get(fresh, `/filing-packets/${p.id}`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'password_change_required');

  const { agent: collector } = await staffAgent('evidence_collector', { member: c.workspace }); // no filing_packets.*
  assert.equal((await get(collector, `/filing-packets/${p.id}`)).status, 403);
  assert.equal((await get(collector, `/cases/${c.caseDoc._id}/filing-packets`)).status, 403);

  const { agent: writer } = await staffAgent('petition_writer', { member: c.workspace }); // view only
  const view = await get(writer, `/filing-packets/${p.id}`);
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.data.actions, { canManage: false, canSubmit: false, canReturn: false, canApprove: false, canFinalize: false });
  assert.equal((await post(writer, `/cases/${c.caseDoc._id}/filing-packets/provision`)).status, 403);
  assert.equal((await patch(writer, `/filing-packets/${p.id}`, { revision: 1, title: 'x' })).status, 403);
  assert.equal((await post(writer, `/filing-packets/${p.id}/submit`, { revision: 1 })).status, 403);

  const { agent: pm2 } = await staffAgent('pm', { member: c.workspace });
  assert.equal((await post(pm2, `/filing-packets/${p.id}/finalize`, { revision: 1 })).status, 403); // pm cannot finalize
  assert.equal((await post(pm2, `/filing-packets/${p.id}/approve`, { revision: 1 })).status, 409); // pm may review; not in review yet
});

test('no membership, removed member, other case and malformed ids are the same 404', async () => {
  const a = await seedCase();
  const b = await seedCase();
  const { agent: pmA } = await staffAgent('pm', { member: a.workspace });
  const { agent: pmB } = await staffAgent('pm', { member: b.workspace });
  const packet = await provision(pmA, a.caseDoc);

  assert.equal((await get(pmB, `/filing-packets/${packet.id}`)).status, 404);
  assert.equal((await get(pmB, `/cases/${a.caseDoc._id}/filing-packets`)).status, 404);
  assert.equal((await patch(pmB, `/filing-packets/${packet.id}`, { revision: 1, title: 'x' })).status, 404);
  assert.equal((await get(pmB, `/filing-packets/${packet.id}/versions`)).status, 404);
  assert.equal((await get(pmA, '/filing-packets/not-an-id')).status, 404);
  assert.equal((await get(pmA, '/filing-packets/64b0f0f0f0f0f0f0f0f0f0f0')).status, 404);

  const { agent: outsider, user } = await staffAgent('uscis_forms_specialist');
  assert.equal((await get(outsider, `/filing-packets/${packet.id}`)).status, 404);
  const member = await WorkspaceMember.create({ workspace: a.workspace._id, memberType: 'employee', adminUser: user._id, workspaceRole: 'contributor', status: 'active' });
  assert.equal((await get(outsider, `/filing-packets/${packet.id}`)).status, 200);
  await WorkspaceMember.updateOne({ _id: member._id }, { status: 'removed' }); // loses access immediately
  assert.equal((await get(outsider, `/filing-packets/${packet.id}`)).status, 404);

  const { agent: admin } = await staffAgent('admin'); // org-wide, no membership
  assert.equal((await get(admin, `/filing-packets/${packet.id}`)).status, 200);
});

test('mutations without a trusted Origin are refused', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const p = await provision(agent, c.caseDoc);
  assert.equal((await agent.patch(`/api/v1/staff/filing-packets/${p.id}`).send({ revision: 1, title: 'x' })).status, 403);
  assert.equal((await agent.post(`/api/v1/staff/filing-packets/${p.id}/submit`).set('Origin', 'https://evil.example').send({ revision: 1 })).status, 403);
  assert.equal((await agent.delete(`/api/v1/staff/filing-packets/${p.id}/items/64b0f0f0f0f0f0f0f0f0f0f0?revision=1`)).status, 403);
});

// ---------------------------------------------------------------------------
// Sources: petition version, exact document versions, Smart Form references
// ---------------------------------------------------------------------------

test('only a finalized petition version from this case can be the packet source', async () => {
  const c = await seedCase();
  const other = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  let p = await provision(agent, c.caseDoc);
  const final = await finalizedPetitionVersion(c);
  const approval = await finalizedPetitionVersion(c, { versionNumber: 1, reason: 'approval', statusSnapshot: 'approved' });
  const foreign = await finalizedPetitionVersion(other);
  const set = (versionId) => post(agent, `/filing-packets/${p.id}/petition-version`, { revision: p.revision, petitionVersionId: versionId && String(versionId) });

  assert.equal((await set(foreign._id)).status, 404, 'a petition version from another case is concealed');
  assert.equal((await set('not-an-id')).status, 404);
  const notFinal = await set(approval._id);
  assert.equal(notFinal.status, 400);
  assert.ok(notFinal.body.error.fieldErrors.petitionVersionId);

  p = await ok(set(final._id));
  assert.equal(p.petitionSource.present, true);
  assert.equal(p.petitionSource.ready, true);
  assert.equal(p.petitionSource.versionNumber, 2);
  assert.equal(p.petitionSource.title, 'EB-2 NIW — Petition');

  const candidates = await get(agent, `/filing-packets/${p.id}/candidates?type=petition_version`);
  assert.deepEqual(candidates.body.data.candidates.map((x) => [x.versionNumber, x.linked]), [[2, true]], 'only the finalized version of this case is offered');

  p = await ok(post(agent, `/filing-packets/${p.id}/petition-version`, { revision: p.revision, petitionVersionId: null }));
  assert.equal(p.petitionSource.present, false);
});

test('a document item pins the exact version; wrong or cross-case sources are concealed; bad documents are refused', async () => {
  const c = await seedCase();
  const other = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const mine = await seedDocument(c, { versions: 2 });
  const mineB = await seedDocument(c, { name: 'Other doc.pdf' });
  const theirs = await seedDocument(other);
  let p = await provision(agent, c.caseDoc);
  const add = (documentId, versionId, extra = {}) => post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(documentId), versionId: String(versionId), ...extra });

  assert.equal((await add(theirs.doc._id, theirs.versions[0]._id)).status, 404, 'cross-case document');
  assert.equal((await add(mine.doc._id, mineB.versions[0]._id)).status, 404, 'a version that belongs to another document');
  assert.equal((await add(mine.doc._id, new mongoose.Types.ObjectId())).status, 404, 'a version that does not exist');
  assert.equal((await add('not-an-id', mine.versions[0]._id)).status, 404);
  assert.equal((await add(mine.doc._id, mine.versions[0]._id, { role: 'wizard' })).status, 400);
  assert.equal((await add(mine.doc._id, mine.versions[0]._id, { required: 'yes' })).status, 400);

  for (const [overrides, label] of [[{ status: 'archived', archivedAt: new Date() }, 'archived'], [{ status: 'rejected', reviewedBy: c.owner._id, reviewedAt: new Date(), clientVisibleReviewComment: 'no' }, 'rejected'], [{ scanStatus: 'infected' }, 'infected']]) {
    const bad = await seedDocument(c, { name: `${label}.pdf`, ...overrides });
    const res = await add(bad.doc._id, bad.versions[0]._id);
    assert.equal(res.status, 400, `${label} source must be refused`);
  }
  await DocumentVersion.updateOne({ _id: mineB.versions[0]._id }, { scanStatus: 'infected' });
  assert.equal((await add(mineB.doc._id, mineB.versions[0]._id)).status, 400, 'an infected version is refused');

  // Staff may pin an OLDER immutable version of an accepted document; the packet keeps exactly that one.
  p = await ok(add(mine.doc._id, mine.versions[0]._id, { role: 'uscis_form' }), 201);
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].source.versionNumber, 1);
  assert.equal(p.items[0].source.currentVersionNumber, 2, 'the UI can see a newer version exists');
  assert.equal(p.items[0].ready, true);
  assert.deepEqual(p.items[0].downloadAction, { documentId: String(mine.doc._id), versionId: String(mine.versions[0]._id) });

  const dup = await add(mine.doc._id, mine.versions[0]._id);
  assert.equal(dup.status, 201);
  assert.equal(dup.body.data.items.length, 1, 'adding the same version twice changes nothing');
  assert.equal(dup.body.data.revision, p.revision);
});

test('a live document replacement never changes the pinned version', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const { doc, versions } = await seedDocument(c);
  let p = await provision(agent, c.caseDoc);
  p = await ok(post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(doc._id), versionId: String(versions[0]._id) }), 201);

  const v2 = await DocumentVersion.create({ document: doc._id, versionNumber: 2, storageKey: 'SECRET-STORAGE-KEY-123', originalName: 'new.pdf', displayName: 'New upload v2.pdf', mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 1, checksum: 'SECRET-CHECKSUM-456', uploadedByType: 'employee', uploadedByAdmin: c.owner._id });
  await CaseDocument.updateOne({ _id: doc._id }, { currentVersion: v2._id, versionCount: 2 });

  const after = (await get(agent, `/filing-packets/${p.id}`)).body.data;
  assert.equal(after.items[0].source.documentVersionId, String(versions[0]._id));
  assert.equal(after.items[0].source.versionNumber, 1);
  assert.equal(after.items[0].source.currentVersionNumber, 2);
  assert.equal(after.revision, p.revision, 'reading never mutates');
});

test('an unaccepted document can be added but is not ready until accepted', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const { doc, versions } = await seedDocument(c, { status: 'pending_review', reviewedBy: null, reviewedAt: null });
  let p = await provision(agent, c.caseDoc);
  p = await ok(post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(doc._id), versionId: String(versions[0]._id) }), 201);
  assert.equal(p.items[0].ready, false);
  assert.match(p.items[0].reason, /not been accepted/);
  assert.deepEqual([p.readiness.requiredReady, p.readiness.requiredTotal, p.readiness.ready], [0, 1, false]);

  await CaseDocument.updateOne({ _id: doc._id }, { status: 'accepted', reviewedBy: c.owner._id, reviewedAt: new Date() });
  const ready = (await get(agent, `/filing-packets/${p.id}`)).body.data;
  assert.equal(ready.items[0].ready, true);
  await CaseDocument.updateOne({ _id: doc._id }, { scanStatus: 'infected' });
  assert.equal((await get(agent, `/filing-packets/${p.id}`)).body.data.items[0].ready, false);
});

test('Smart Form references: approved and locked are ready, draft/submitted are not, cross-case is concealed, a later revision breaks readiness', async () => {
  const c = await seedCase();
  const other = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const locked = await seedForm(c, { status: 'locked' });
  const approved = await seedForm(c, { status: 'approved', revision: 4, lockedRevision: null });
  const draft = await seedForm(c, { status: 'draft', revision: 2, lockedRevision: null });
  const submitted = await seedForm(c, { status: 'submitted', revision: 3, lockedRevision: null });
  const foreign = await seedForm(other);
  let p = await provision(agent, c.caseDoc);

  for (const form of [locked, approved, draft, submitted]) {
    p = await ok(post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'smart_form_reference', smartFormId: String(form._id) }), 201);
  }
  assert.equal((await post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'smart_form_reference', smartFormId: String(foreign._id) })).status, 404);
  const state = Object.fromEntries(p.items.map((i) => [i.source.revision, i]));
  assert.equal(state[6].ready, true);
  assert.equal(state[6].source.lockedRevision, 6);
  assert.equal(state[4].ready, true);
  assert.equal(state[2].ready, false);
  assert.match(state[2].reason, /not yet approved/);
  assert.equal(state[3].ready, false);
  assert.ok(p.items.every((i) => i.downloadAction === null), 'a Smart Form is a reference, never a downloadable filing PDF');

  await CaseSmartForm.updateOne({ _id: approved._id }, { revision: 5 }); // changed after it was reviewed and pinned
  const changed = (await get(agent, `/filing-packets/${p.id}`)).body.data.items.find((i) => i.source.revision === 4);
  assert.equal(changed.ready, false);
  assert.match(changed.reason, /changed after it was added/);

  const candidates = (await get(agent, `/filing-packets/${p.id}/candidates?type=smart_form`)).body.data.candidates;
  assert.deepEqual(candidates.map((x) => x.status).sort(), ['approved', 'locked'], 'only reviewed forms are offered');
});

test('candidates are same-case and bounded, and DTOs never carry storage metadata', async () => {
  const c = await seedCase();
  const other = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  const mine = await seedDocument(c, { name: CANARY, versions: 2 });
  await seedDocument(other);
  await seedDocument(c, { name: 'pending.pdf', status: 'pending_review', reviewedBy: null, reviewedAt: null });
  let p = await provision(agent, c.caseDoc);
  p = await ok(post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(mine.doc._id), versionId: String(mine.versions[1]._id) }), 201);

  const docs = await get(agent, `/filing-packets/${p.id}/candidates?type=document_version`);
  assert.equal(docs.status, 200);
  assert.equal(docs.body.data.candidates.length, 1, 'only accepted documents of this case');
  assert.deepEqual([docs.body.data.candidates[0].versionNumber, docs.body.data.candidates[0].linked, docs.body.data.candidates[0].categoryName], [2, true, 'USCIS Forms']);
  assert.equal((await get(agent, `/filing-packets/${p.id}/candidates?type=nope`)).status, 400);

  const everything = JSON.stringify([(await get(agent, `/filing-packets/${p.id}`)).body, docs.body]);
  for (const secret of ['SECRET-STORAGE-KEY-123', 'SECRET-CHECKSUM-456', 'storageKey', 'checksum', 'passwordHash', 'tokenHash']) {
    assert.equal(everything.includes(secret), false, `${secret} leaked into a packet DTO`);
  }
});

test('the download action points at the existing secure version route; the packet serves no bytes itself', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: writer } = await staffAgent('petition_writer', { member: c.workspace });
  const { doc, versions } = await seedDocument(c);
  let p = await provision(pm, c.caseDoc);
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(doc._id), versionId: String(versions[0]._id) }), 201);
  assert.ok(p.items[0].downloadAction);
  // Every role that may view packets today may also view document versions, so both get the action;
  // the flag follows document_versions.view so a future narrower grant removes it without a packet change.
  const asWriter = (await get(writer, `/filing-packets/${p.id}`)).body.data;
  assert.deepEqual(asWriter.items[0].downloadAction, p.items[0].downloadAction);
  assert.equal((await get(pm, `/filing-packets/${p.id}/download`)).status, 404, 'no packet-level file route exists');
});

// ---------------------------------------------------------------------------
// Items: metadata, removal, reorder, concurrency
// ---------------------------------------------------------------------------

async function packetWithThreeItems(agent, c) {
  let p = await provision(agent, c.caseDoc);
  const docs = [await seedDocument(c, { name: 'A.pdf' }), await seedDocument(c, { name: 'B.pdf' }), await seedDocument(c, { name: 'C.pdf' })];
  for (const d of docs) p = await ok(post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(d.doc._id), versionId: String(d.versions[0]._id) }), 201);
  return p;
}

test('item metadata, removal renumbering and reorder are deterministic and contiguous', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  let p = await packetWithThreeItems(agent, c);
  assert.deepEqual(p.items.map((i) => i.order), [1, 2, 3]);
  const [a, b, d] = p.items.map((i) => i.id);

  p = await ok(patch(agent, `/filing-packets/${p.id}/items/${b}`, { revision: p.revision, role: 'cover_sheet', required: false, notes: 'Top of the packet' }));
  const edited = p.items.find((i) => i.id === b);
  assert.deepEqual([edited.role, edited.required, edited.notes], ['cover_sheet', false, 'Top of the packet']);
  assert.equal((await patch(agent, `/filing-packets/${p.id}/items/${b}`, { revision: p.revision, role: 'wizard' })).status, 400);
  assert.equal((await patch(agent, `/filing-packets/${p.id}/items/${b}`, { revision: p.revision, documentVersion: 'x' })).status, 200, 'source ids are not editable and are ignored');
  assert.equal((await patch(agent, `/filing-packets/${p.id}/items/64b0f0f0f0f0f0f0f0f0f0f0`, { revision: p.revision, role: 'other' })).status, 404);

  p = (await get(agent, `/filing-packets/${p.id}`)).body.data;
  p = await ok(post(agent, `/filing-packets/${p.id}/reorder`, { revision: p.revision, orderedItemIds: [d, a, b] }));
  assert.deepEqual(p.items.map((i) => [i.id, i.order]), [[d, 1], [a, 2], [b, 3]]);

  for (const orderedItemIds of [[a, a, b], [a, b], [a, b, d, d], [a, b, '64b0f0f0f0f0f0f0f0f0f0f0'], 'nope']) {
    const bad = await post(agent, `/filing-packets/${p.id}/reorder`, { revision: p.revision, orderedItemIds });
    assert.equal(bad.status, 400, JSON.stringify(orderedItemIds));
  }
  assert.equal(await FilingPacket.findById(p.id).then((x) => x.revision), p.revision, 'a rejected reorder writes nothing');

  p = await ok(del(agent, `/filing-packets/${p.id}/items/${a}?revision=${p.revision}`));
  assert.deepEqual(p.items.map((i) => [i.id, i.order]), [[d, 1], [b, 2]], 'removal renumbers contiguously');
  assert.equal((await del(agent, `/filing-packets/${p.id}/items/${a}?revision=${p.revision}`)).status, 404);
});

test('stale revisions are a controlled 409 and simultaneous changes never silently overwrite', async () => {
  const c = await seedCase();
  const { agent } = await staffAgent('pm', { member: c.workspace });
  let p = await packetWithThreeItems(agent, c);
  const ids = p.items.map((i) => i.id);

  const stale = await post(agent, `/filing-packets/${p.id}/reorder`, { revision: p.revision - 1, orderedItemIds: ids.slice().reverse() });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'conflict');
  assert.equal(stale.body.error.fieldErrors.revision, p.revision);
  assert.equal((await patch(agent, `/filing-packets/${p.id}`, { title: 'x' })).status, 400, 'revision is mandatory');

  const extra = await seedDocument(c, { name: 'D.pdf' });
  const results = await Promise.all([
    post(agent, `/filing-packets/${p.id}/reorder`, { revision: p.revision, orderedItemIds: ids.slice().reverse() }),
    post(agent, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(extra.doc._id), versionId: String(extra.versions[0]._id) }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201].filter((s) => results.some((r) => r.status === s)).slice(0, 1).concat(409).sort(), 'exactly one wins, the other is a 409');
  assert.equal((await FilingPacket.findById(p.id)).revision, p.revision + 1);
});

// ---------------------------------------------------------------------------
// Lifecycle and the immutable snapshot
// ---------------------------------------------------------------------------

test('submit needs a petition source (where required) and at least one item, but not ready items', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  let p = await provision(pm, c.caseDoc);

  const empty = await post(pm, `/filing-packets/${p.id}/submit`, { revision: p.revision });
  assert.equal(empty.status, 400);
  assert.ok(empty.body.error.fieldErrors.petitionVersion);
  assert.ok(empty.body.error.fieldErrors.items);

  const pending = await seedDocument(c, { status: 'pending_review', reviewedBy: null, reviewedAt: null });
  p = await ok(post(pm, `/filing-packets/${p.id}/petition-version`, { revision: p.revision, petitionVersionId: String((await finalizedPetitionVersion(c))._id) }));
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(pending.doc._id), versionId: String(pending.versions[0]._id) }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/submit`, { revision: p.revision }));
  assert.equal(p.status, 'review');
  assert.deepEqual(p.actions, { canManage: false, canSubmit: false, canReturn: true, canApprove: true, canFinalize: false });

  // review state: the manifest is frozen for the assembler
  assert.equal((await patch(pm, `/filing-packets/${p.id}`, { revision: p.revision, title: 'tamper' })).status, 409);
  assert.equal((await post(pm, `/filing-packets/${p.id}/reorder`, { revision: p.revision, orderedItemIds: [p.items[0].id] })).status, 409);
});

test('the explicit no-petition exception: an `other` packet can be filed without a petition source', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const { doc, versions } = await seedDocument(c);
  let p = await ok(post(pm, `/cases/${c.caseDoc._id}/filing-packets`, { kind: 'other', title: 'Supporting material' }), 201);
  assert.equal(p.petitionSource.required, false);
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(doc._id), versionId: String(versions[0]._id) }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/submit`, { revision: p.revision }));
  p = await ok(post(reviewer, `/filing-packets/${p.id}/approve`, { revision: p.revision }));
  p = await ok(post(reviewer, `/filing-packets/${p.id}/finalize`, { revision: p.revision }));
  assert.equal(p.status, 'finalized');
  const version = (await get(pm, `/filing-packets/${p.id}/versions/${p.versions[0].id}`)).body.data;
  assert.equal(version.petitionSource, null);
});

test('return needs a note; approve only from review; finalize only from approved and with finalize permission', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const art = await seedArtifacts(c);
  let p = await approvedPacket(pm, reviewer, c, art);
  assert.equal(p.status, 'approved');
  assert.equal(p.approvedByName, 'Staff reviewer');

  assert.equal((await post(reviewer, `/filing-packets/${p.id}/approve`, { revision: p.revision })).status, 409, 'approve needs review');
  assert.equal((await post(reviewer, `/filing-packets/${p.id}/return`, { revision: p.revision })).status, 400);
  assert.equal((await post(pm, `/filing-packets/${p.id}/finalize`, { revision: p.revision })).status, 403);

  p = await ok(post(reviewer, `/filing-packets/${p.id}/return`, { revision: p.revision, internalReviewNote: 'Reorder the exhibits.' }));
  assert.equal(p.status, 'needs_changes');
  assert.equal(p.internalReviewNote, 'Reorder the exhibits.');
  assert.equal(p.approvedByName, '');
  assert.equal((await post(reviewer, `/filing-packets/${p.id}/finalize`, { revision: p.revision })).status, 409, 'finalize needs approved');

  p = await ok(post(pm, `/filing-packets/${p.id}/submit`, { revision: p.revision }));
  p = await ok(post(reviewer, `/filing-packets/${p.id}/approve`, { revision: p.revision }));
  assert.equal(p.status, 'approved');
  assert.equal(p.internalReviewNote, '');
});

test('finalization is blocked by a required unready item, not by an optional one, and writes an exact snapshot', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const art = await seedArtifacts(c);
  const pending = await seedDocument(c, { name: 'Optional.pdf', status: 'pending_review', reviewedBy: null, reviewedAt: null });
  const draftForm = await seedForm(c, { status: 'draft', revision: 1, lockedRevision: null });

  let p = await provision(pm, c.caseDoc);
  p = await ok(post(pm, `/filing-packets/${p.id}/petition-version`, { revision: p.revision, petitionVersionId: String(art.petitionVersion._id) }));
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(art.doc._id), versionId: String(art.version._id), role: 'uscis_form' }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'document_version', documentId: String(pending.doc._id), versionId: String(pending.versions[0]._id), role: 'exhibit', required: true }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/items`, { revision: p.revision, type: 'smart_form_reference', smartFormId: String(draftForm._id), required: false }), 201);
  p = await ok(post(pm, `/filing-packets/${p.id}/submit`, { revision: p.revision }));
  p = await ok(post(reviewer, `/filing-packets/${p.id}/approve`, { revision: p.revision }));

  const blocked = await post(reviewer, `/filing-packets/${p.id}/finalize`, { revision: p.revision });
  assert.equal(blocked.status, 400);
  const pendingItem = p.items.find((i) => i.label.startsWith('Optional'));
  assert.deepEqual(Object.keys(blocked.body.error.fieldErrors), [`item:${pendingItem.id}`], 'only the required unready item blocks; the optional draft form does not');
  assert.equal((await FilingPacket.findById(p.id)).status, 'approved');
  assert.equal(await FilingPacketVersion.countDocuments({ packet: p.id }), 0);

  await CaseDocument.updateOne({ _id: pending.doc._id }, { status: 'accepted', reviewedBy: c.owner._id, reviewedAt: new Date() });
  const final = await ok(post(reviewer, `/filing-packets/${p.id}/finalize`, { revision: p.revision }));
  assert.equal(final.status, 'finalized');
  assert.equal(final.finalizedByName, 'Staff reviewer');
  assert.deepEqual(final.actions, { canManage: false, canSubmit: false, canReturn: false, canApprove: false, canFinalize: false });
  assert.equal(final.versions.length, 1);
  assert.equal(final.versions[0].versionNumber, 1);
  assert.match(final.versions[0].manifestHash, /^[0-9a-f]{64}$/);

  const version = (await get(pm, `/filing-packets/${p.id}/versions/${final.versions[0].id}`)).body.data;
  assert.equal(version.sourceRevision, final.revision);
  assert.equal(version.petitionSource.versionNumber, 2);
  assert.equal(version.petitionSource.petitionVersionId, String(art.petitionVersion._id));
  assert.deepEqual(version.items.map((i) => [i.order, i.type, i.role, i.required]), [[1, 'document_version', 'uscis_form', true], [2, 'document_version', 'exhibit', true], [3, 'smart_form_reference', 'uscis_form', false]]);
  assert.equal(version.items[0].source.documentVersionId, String(art.version._id));
  assert.equal(version.items[0].source.versionNumber, 1);
  assert.equal(version.items[0].source.categoryName, 'USCIS Forms');
  assert.equal(version.items[0].source.mimeType, 'application/pdf');
  assert.equal(version.items[0].status, 'accepted');
  assert.equal(version.items[2].status, 'draft', 'an optional unready form is recorded as it was');
  assert.ok(version.items[0].downloadAction, 'exact version, served by the existing secure route');
  const dump = JSON.stringify(version);
  for (const secret of ['SECRET-STORAGE-KEY-123', 'SECRET-CHECKSUM-456', 'storageKey', 'checksum']) assert.equal(dump.includes(secret), false);
});

test('the finalized snapshot and its hash survive live changes; the hash is stable and recomputable', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const art = await seedArtifacts(c);
  let p = await approvedPacket(pm, reviewer, c, art);
  p = await ok(post(reviewer, `/filing-packets/${p.id}/finalize`, { revision: p.revision }));
  const stored = await FilingPacketVersion.findOne({ packet: p.id }).lean();

  // recompute from the stored immutable data
  const recomputed = computeManifestHash({
    packetId: stored.packet,
    versionNumber: stored.versionNumber,
    sourceRevision: stored.sourceRevision,
    petitionVersionId: stored.petitionSource.petitionVersionId,
    items: stored.items,
  });
  assert.equal(recomputed, stored.manifestHash);
  assert.equal(computeManifestHash({ packetId: stored.packet, versionNumber: stored.versionNumber, sourceRevision: stored.sourceRevision, petitionVersionId: stored.petitionSource.petitionVersionId, items: stored.items.slice().reverse() }), stored.manifestHash, 'item array order does not matter; the order field does');
  assert.notEqual(computeManifestHash({ packetId: stored.packet, versionNumber: stored.versionNumber + 1, sourceRevision: stored.sourceRevision, petitionVersionId: stored.petitionSource.petitionVersionId, items: stored.items }), stored.manifestHash);
  assert.notEqual(computeManifestHash({ packetId: stored.packet, versionNumber: stored.versionNumber, sourceRevision: stored.sourceRevision, petitionVersionId: stored.petitionSource.petitionVersionId, items: stored.items.map((i, n) => (n === 0 ? { ...i, order: 99 } : i)) }), stored.manifestHash);

  // live changes after finalization
  const v2 = await DocumentVersion.create({ document: art.doc._id, versionNumber: 2, storageKey: 'k', originalName: 'n.pdf', displayName: 'Replacement v2.pdf', mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: 'pdf', size: 9, checksum: 'c', uploadedByType: 'employee', uploadedByAdmin: c.owner._id });
  await CaseDocument.updateOne({ _id: art.doc._id }, { currentVersion: v2._id, displayName: 'Renamed later', status: 'archived', archivedAt: new Date() });
  await CaseSmartForm.updateOne({ _id: art.form._id }, { revision: 99, status: 'draft' });
  await finalizedPetitionVersion(c, { petition: art.petitionVersion.petition, versionNumber: 3 });

  const after = (await get(pm, `/filing-packets/${p.id}/versions/${p.versions[0].id}`)).body.data;
  assert.equal(after.manifestHash, stored.manifestHash);
  assert.equal(after.petitionSource.versionNumber, 2);
  assert.equal(after.items[0].source.documentVersionId, String(art.version._id));
  assert.equal(after.items[0].source.versionNumber, 1);
  assert.equal(after.items[0].status, 'accepted');
  assert.equal(after.items[1].source.revision, 6);
  assert.equal(after.items[1].source.lockedRevision, 6);
  assert.equal(after.items[1].status, 'locked');
  assert.equal(await FilingPacketVersion.countDocuments({ packet: p.id }), 1);
});

test('a finalized packet rejects every mutation; versions refuse update and delete; no delete route exists', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: admin } = await staffAgent('admin');
  const art = await seedArtifacts(c);
  let p = await approvedPacket(pm, admin, c, art);
  p = await ok(post(admin, `/filing-packets/${p.id}/finalize`, { revision: p.revision }));
  const r = p.revision;
  const extra = await seedDocument(c, { name: 'Late.pdf' });

  for (const res of [
    await patch(admin, `/filing-packets/${p.id}`, { revision: r, title: 'tamper' }),
    await post(admin, `/filing-packets/${p.id}/petition-version`, { revision: r, petitionVersionId: null }),
    await post(admin, `/filing-packets/${p.id}/items`, { revision: r, type: 'document_version', documentId: String(extra.doc._id), versionId: String(extra.versions[0]._id) }),
    await patch(admin, `/filing-packets/${p.id}/items/${p.items[0].id}`, { revision: r, role: 'other' }),
    await del(admin, `/filing-packets/${p.id}/items/${p.items[0].id}?revision=${r}`),
    await post(admin, `/filing-packets/${p.id}/reorder`, { revision: r, orderedItemIds: p.items.map((i) => i.id).reverse() }),
    await post(admin, `/filing-packets/${p.id}/submit`, { revision: r }),
    await post(admin, `/filing-packets/${p.id}/return`, { revision: r, internalReviewNote: 'x' }),
    await post(admin, `/filing-packets/${p.id}/approve`, { revision: r }),
    await post(admin, `/filing-packets/${p.id}/finalize`, { revision: r }),
  ]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_state');
  }
  assert.equal((await FilingPacket.findById(p.id)).revision, r);

  const version = await FilingPacketVersion.findOne({ packet: p.id });
  await assert.rejects(() => FilingPacketVersion.updateOne({ _id: version._id }, { titleSnapshot: 'x' }), /immutable/);
  await assert.rejects(() => FilingPacketVersion.deleteMany({}), /immutable/);
  version.titleSnapshot = 'x';
  await assert.rejects(() => version.save(), /immutable/);
  assert.equal((await del(admin, `/filing-packets/${p.id}`)).status, 404, 'there is no packet delete route');
});

test('if the snapshot cannot be written, finalization is not reported and the status is put back', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: admin } = await staffAgent('admin');
  const art = await seedArtifacts(c);
  const p = await approvedPacket(pm, admin, c, art);

  const original = FilingPacketVersion.create;
  FilingPacketVersion.create = async () => {
    throw new Error('disk full');
  };
  let res;
  try {
    res = await post(admin, `/filing-packets/${p.id}/finalize`, { revision: p.revision });
  } finally {
    FilingPacketVersion.create = original;
  }
  assert.equal(res.status, 409);
  const live = await FilingPacket.findById(p.id).lean();
  assert.equal(live.status, 'approved');
  assert.equal(live.finalizedAt, null);
  assert.equal(await CaseActivity.countDocuments({ case: c.caseDoc._id, type: 'filing_packet_finalized' }), 0);

  const retry = await post(admin, `/filing-packets/${p.id}/finalize`, { revision: live.revision });
  assert.equal(retry.status, 200);
});

test('case activity records the milestones with no filenames; item changes add none; versions are numbered per packet', async () => {
  const c = await seedCase();
  const { agent: pm } = await staffAgent('pm', { member: c.workspace });
  const { agent: reviewer } = await staffAgent('reviewer', { member: c.workspace });
  const art = await seedArtifacts(c);
  const p = await approvedPacket(pm, reviewer, c, art);
  await post(reviewer, `/filing-packets/${p.id}/finalize`, { revision: p.revision });

  const types = (await CaseActivity.find({ case: c.caseDoc._id, type: /^filing_packet_/ }).sort({ createdAt: 1 }).lean()).map((a) => a.type);
  assert.deepEqual(types, ['filing_packet_created', 'filing_packet_submitted', 'filing_packet_approved', 'filing_packet_finalized']);
  assert.equal(JSON.stringify(await CaseActivity.find({ case: c.caseDoc._id }).lean()).includes(CANARY), false, 'filenames must never reach CaseActivity');

  const versions = await get(pm, `/filing-packets/${p.id}/versions`);
  assert.deepEqual(versions.body.data.versions.map((v) => v.versionNumber), [1]);
  assert.equal((await get(pm, `/filing-packets/${p.id}/versions/64b0f0f0f0f0f0f0f0f0f0f0`)).status, 404);
  assert.equal((await get(pm, `/filing-packets/${p.id}/versions/not-an-id`)).status, 404);
});
