const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const WorkspaceMember = require('../models/WorkspaceMember');
const AdminUser = require('../models/admin/User');
const casePolicy = require('../services/casePolicy');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

function reqWithRole(role, adminUserId) {
  return { session: { adminUser: { id: adminUserId ? String(adminUserId) : undefined, role, name: 'Test' } } };
}

function fakeWorkspaceId() {
  return new mongoose.Types.ObjectId();
}

test('employee with capability and active membership can view', async () => {
  const pm = await AdminUser.create({ name: 'PM', email: 'p1@example.com', password: 'x', role: 'pm' });
  const workspaceId = fakeWorkspaceId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'project_manager',
    status: 'active',
  });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await casePolicy.canViewCase(req, workspaceId), true);
});

test('employee with capability but no membership is denied', async () => {
  const pm = await AdminUser.create({ name: 'PM2', email: 'p2@example.com', password: 'x', role: 'pm' });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await casePolicy.canViewCase(req, fakeWorkspaceId()), false);
});

test('employee with membership but no capability (viewer role) is denied', async () => {
  const viewer = await AdminUser.create({ name: 'V', email: 'v1@example.com', password: 'x', role: 'viewer' });
  const workspaceId = fakeWorkspaceId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: viewer._id,
    workspaceRole: 'contributor',
    status: 'active',
  });
  const req = reqWithRole('viewer', viewer._id);
  assert.equal(await casePolicy.canViewCase(req, workspaceId), false);
});

test('cases.view_all (admin) bypasses membership entirely', async () => {
  const admin = await AdminUser.create({ name: 'A', email: 'a1@example.com', password: 'x', role: 'admin' });
  const req = reqWithRole('admin', admin._id);
  assert.equal(await casePolicy.canViewCase(req, fakeWorkspaceId()), true);
});

test('missing role is denied', async () => {
  const req = { session: {} };
  assert.equal(await casePolicy.canViewCase(req, fakeWorkspaceId()), false);
});

test('unknown role is denied', async () => {
  const req = reqWithRole('totally-made-up-role');
  assert.equal(await casePolicy.canViewCase(req, fakeWorkspaceId()), false);
});

test('unknown capability is denied for every role, including super_admin (verified via can() directly, since casePolicy exposes no way to probe a fake capability)', () => {
  const { can } = require('../utils/permissions');
  assert.equal(can(reqWithRole('super_admin'), 'not.a.real.capability'), false);
});

test('a removed membership is denied, same as no membership', async () => {
  const pm = await AdminUser.create({ name: 'PM3', email: 'p3@example.com', password: 'x', role: 'pm' });
  const workspaceId = fakeWorkspaceId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'removed',
    removedAt: new Date(),
  });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await casePolicy.canViewCase(req, workspaceId), false);
});

test('canManageCase / canAssignCase / canArchiveCase / canManageWorkspaceMembers each require their own capability', async () => {
  const pm = await AdminUser.create({ name: 'PM4', email: 'p4@example.com', password: 'x', role: 'pm' });
  const workspaceId = fakeWorkspaceId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'project_manager',
    status: 'active',
  });
  const req = reqWithRole('pm', pm._id);

  assert.equal(await casePolicy.canManageCase(req, workspaceId), true, 'pm has cases.manage');
  assert.equal(await casePolicy.canAssignCase(req, workspaceId), false, 'pm does not have cases.assign');
  assert.equal(await casePolicy.canArchiveCase(req, workspaceId), false, 'pm does not have cases.archive');
  assert.equal(await casePolicy.canManageWorkspaceMembers(req, workspaceId), true, 'pm has workspace.members.manage');
});
