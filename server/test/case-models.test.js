const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const { addOrReactivateMember, removeMember } = require('../services/workspaceMembership');
const { generateCaseNumber } = require('../utils/caseNumber');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

async function seedCaseAndWorkspace() {
  const client = await ClientUser.create({
    email: 'model-test@example.com',
    normalizedEmail: 'model-test@example.com',
    passwordHash: 'x',
    status: 'active',
  });
  const pm = await AdminUser.create({ name: 'PM', email: 'pm-model@example.com', password: 'x', role: 'pm' });
  const caseDoc = await ClientCase.create({
    caseNumber: generateCaseNumber(),
    title: 'Model Test Case',
    caseType: 'eb1a',
    primaryClient: client._id,
    projectManager: pm._id,
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: 'primary',
    name: 'Primary Workspace',
  });
  return { client, pm, caseDoc, workspace };
}

test('generateCaseNumber produces the documented IH-<year>-<6 chars> shape', () => {
  const n = generateCaseNumber(new Date('2026-01-01'));
  assert.match(n, /^IH-2026-[A-Z0-9]{6}$/);
});

test('ClientCase requires primaryClient and projectManager', async () => {
  await assert.rejects(
    ClientCase.create({ caseNumber: generateCaseNumber(), title: 'x', caseType: 'other' }),
  );
});

test('ClientCase.caseNumber is unique', async () => {
  const { client, pm } = await seedCaseAndWorkspace();
  const number = generateCaseNumber();
  await ClientCase.create({ caseNumber: number, title: 'a', caseType: 'other', primaryClient: client._id, projectManager: pm._id });
  await assert.rejects(
    ClientCase.create({ caseNumber: number, title: 'b', caseType: 'other', primaryClient: client._id, projectManager: pm._id }),
  );
});

test('ClientCase.consultation is unique when set, but multiple null consultations are allowed', async () => {
  const { client, pm } = await seedCaseAndWorkspace();
  const Consultation = require('../models/Consultation');
  const lead = await Consultation.create({ name: 'x', email: 'x@example.com', message: 'x'.repeat(12) });

  await ClientCase.create({ caseNumber: generateCaseNumber(), title: 'a', caseType: 'other', primaryClient: client._id, projectManager: pm._id, consultation: lead._id });
  await assert.rejects(
    ClientCase.create({ caseNumber: generateCaseNumber(), title: 'b', caseType: 'other', primaryClient: client._id, projectManager: pm._id, consultation: lead._id }),
  );

  // Two cases with no consultation at all must NOT collide (partial index).
  await assert.doesNotReject(
    ClientCase.create({ caseNumber: generateCaseNumber(), title: 'c', caseType: 'other', primaryClient: client._id, projectManager: pm._id }),
  );
  await assert.doesNotReject(
    ClientCase.create({ caseNumber: generateCaseNumber(), title: 'd', caseType: 'other', primaryClient: client._id, projectManager: pm._id }),
  );
});

test('ClientCase.status mirrors archivedAt automatically', async () => {
  const { caseDoc } = await seedCaseAndWorkspace();
  assert.equal(caseDoc.status, 'active');
  caseDoc.archivedAt = new Date();
  await caseDoc.save();
  assert.equal(caseDoc.status, 'archived');
});

test('CaseWorkspace: only one primary workspace per case', async () => {
  const { caseDoc } = await seedCaseAndWorkspace();
  await assert.rejects(
    CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'Duplicate' }),
  );
});

test('WorkspaceMember: memberType "client" requires clientUser and forbids adminUser', async () => {
  const { workspace, pm } = await seedCaseAndWorkspace();
  await assert.rejects(
    WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', workspaceRole: 'client' }),
  );
  await assert.rejects(
    WorkspaceMember.create({
      workspace: workspace._id,
      memberType: 'client',
      clientUser: new (require('mongoose').Types.ObjectId)(),
      adminUser: pm._id,
      workspaceRole: 'client',
    }),
  );
});

test('WorkspaceMember: memberType "employee" requires adminUser and forbids clientUser', async () => {
  const { workspace, client } = await seedCaseAndWorkspace();
  await assert.rejects(
    WorkspaceMember.create({ workspace: workspace._id, memberType: 'employee', workspaceRole: 'contributor' }),
  );
  await assert.rejects(
    WorkspaceMember.create({
      workspace: workspace._id,
      memberType: 'employee',
      adminUser: new (require('mongoose').Types.ObjectId)(),
      clientUser: client._id,
      workspaceRole: 'contributor',
    }),
  );
});

test('WorkspaceMember: duplicate client membership on the same workspace is rejected at the DB level', async () => {
  const { workspace, client } = await seedCaseAndWorkspace();
  await WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  await assert.rejects(
    WorkspaceMember.create({ workspace: workspace._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' }),
  );
});

test('addOrReactivateMember: reactivating a removed member updates the same document, not a new one', async () => {
  const { workspace, pm } = await seedCaseAndWorkspace();
  const first = await addOrReactivateMember({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'active',
  });
  await removeMember(first._id);

  const reactivated = await addOrReactivateMember({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'active',
  });

  assert.equal(String(reactivated._id), String(first._id));
  assert.equal(reactivated.status, 'active');
  assert.equal(await WorkspaceMember.countDocuments({ workspace: workspace._id, adminUser: pm._id }), 1);
});
