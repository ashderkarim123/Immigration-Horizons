const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const WorkspaceMember = require('../models/WorkspaceMember');
const AdminUser = require('../models/admin/User');
const documentPolicy = require('../services/documentPolicy');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

function reqWithRole(role, adminUserId) {
  return { session: { adminUser: { id: adminUserId ? String(adminUserId) : undefined, role, name: 'Test' } } };
}

test('a role without documents.view is denied even with membership', async () => {
  const viewer = await AdminUser.create({ name: 'V', email: `v1-${Date.now()}@example.com`, password: 'x', role: 'viewer' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: viewer._id,
    workspaceRole: 'contributor',
    status: 'active',
  });
  const req = reqWithRole('viewer', viewer._id);
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), false);
});

test('documents.view capability without active workspace membership is denied', async () => {
  const pm = await AdminUser.create({ name: 'PM', email: `p1-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  const req = reqWithRole('pm', pm._id);
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), false);
});

test('documents.view capability with active workspace membership is allowed', async () => {
  const pm = await AdminUser.create({ name: 'PM2', email: `p2-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'active',
  });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), true);
});

test('documents.view_all bypasses the membership requirement (admin/super_admin only)', async () => {
  const admin = await AdminUser.create({ name: 'Admin', email: `a1-${Date.now()}@example.com`, password: 'x', role: 'admin' });
  const workspaceId = new mongoose.Types.ObjectId();
  const req = reqWithRole('admin', admin._id);
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), true);
});

test('a removed membership immediately loses access on the next check', async () => {
  const pm = await AdminUser.create({ name: 'PM3', email: `p3-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  const membership = await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'active',
  });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), true);

  membership.status = 'removed';
  await membership.save();
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), false);
});

test('a missing role (no session) fails closed', async () => {
  const req = { session: {} };
  const workspaceId = new mongoose.Types.ObjectId();
  assert.equal(await documentPolicy.canViewDocumentCenter(req, workspaceId), false);
});

test('review/upload/archive/category-management capabilities are independently checked', async () => {
  const pm = await AdminUser.create({ name: 'PM4', email: `p4-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'active',
  });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await documentPolicy.canUploadDocument(req, workspaceId), true);
  assert.equal(await documentPolicy.canReviewDocument(req, workspaceId), true);
  assert.equal(await documentPolicy.canArchiveDocument(req, workspaceId), true);
  assert.equal(await documentPolicy.canManageCategories(req, workspaceId), true);
  assert.equal(await documentPolicy.canManageDocumentRequests(req, workspaceId), true);
});
