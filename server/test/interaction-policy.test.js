const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const WorkspaceMember = require('../models/WorkspaceMember');
const AdminUser = require('../models/admin/User');
const interactionPolicy = require('../services/interactionPolicy');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

function reqWithRole(role, adminUserId) {
  return { session: { adminUser: { id: adminUserId ? String(adminUserId) : undefined, role, name: 'Test' } } };
}

function consultationScopedInteraction() {
  return { scopeType: 'consultation', workspace: null };
}
function caseScopedInteraction(workspaceId) {
  return { scopeType: 'case', workspace: workspaceId };
}

test('consultation-scoped: any queries.view holder is authorized regardless of membership', async () => {
  const pm = await AdminUser.create({ name: 'PM', email: `p1-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await interactionPolicy.canViewInteraction(req, consultationScopedInteraction()), true);
});

test('consultation-scoped: a role without queries.view is denied', async () => {
  const viewer = await AdminUser.create({ name: 'V', email: `v1-${Date.now()}@example.com`, password: 'x', role: 'viewer' });
  const req = reqWithRole('viewer', viewer._id);
  assert.equal(await interactionPolicy.canViewInteraction(req, consultationScopedInteraction()), false);
});

test('case-scoped: employee with capability and active workspace membership is allowed', async () => {
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
  assert.equal(await interactionPolicy.canViewInteraction(req, caseScopedInteraction(workspaceId)), true);
});

test('case-scoped: employee with capability but no membership is denied', async () => {
  const pm = await AdminUser.create({ name: 'PM3', email: `p3-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const req = reqWithRole('pm', pm._id);
  assert.equal(
    await interactionPolicy.canViewInteraction(req, caseScopedInteraction(new mongoose.Types.ObjectId())),
    false,
  );
});

test('case-scoped: queries.view_all (admin) bypasses membership', async () => {
  const admin = await AdminUser.create({ name: 'A', email: `a1-${Date.now()}@example.com`, password: 'x', role: 'admin' });
  const req = reqWithRole('admin', admin._id);
  assert.equal(
    await interactionPolicy.canViewInteraction(req, caseScopedInteraction(new mongoose.Types.ObjectId())),
    true,
  );
});

test('case-scoped: removed membership is denied, same as no membership', async () => {
  const pm = await AdminUser.create({ name: 'PM4', email: `p4-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({
    workspace: workspaceId,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'contributor',
    status: 'removed',
    removedAt: new Date(),
  });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await interactionPolicy.canViewInteraction(req, caseScopedInteraction(workspaceId)), false);
});

test('missing role is denied', async () => {
  const req = { session: {} };
  assert.equal(await interactionPolicy.canViewInteraction(req, consultationScopedInteraction()), false);
  assert.equal(await interactionPolicy.canViewInteraction(req, caseScopedInteraction(new mongoose.Types.ObjectId())), false);
});

test('unknown role is denied', async () => {
  const req = reqWithRole('made-up-role');
  assert.equal(await interactionPolicy.canViewInteraction(req, consultationScopedInteraction()), false);
});

test('per-action capability isolation: pm holds queries.answer but a role without it is denied', async () => {
  const pm = await AdminUser.create({ name: 'PM5', email: `p5-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const editor = await AdminUser.create({ name: 'E', email: `e1-${Date.now()}@example.com`, password: 'x', role: 'editor' });

  assert.equal(await interactionPolicy.canAnswerInteraction(reqWithRole('pm', pm._id), consultationScopedInteraction()), true);
  assert.equal(await interactionPolicy.canAnswerInteraction(reqWithRole('editor', editor._id), consultationScopedInteraction()), false);
});
