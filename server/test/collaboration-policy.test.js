const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const WorkspaceMember = require('../models/WorkspaceMember');
const ChannelMember = require('../models/ChannelMember');
const AdminUser = require('../models/admin/User');
const collaborationPolicy = require('../services/collaborationPolicy');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

function reqWithRole(role, adminUserId) {
  return { session: { adminUser: { id: adminUserId ? String(adminUserId) : undefined, role, name: 'Test' } } };
}

function channelDoc(workspaceId, overrides = {}) {
  return { _id: new mongoose.Types.ObjectId(), workspace: workspaceId, visibility: 'all_members', case: new mongoose.Types.ObjectId(), ...overrides };
}

test('a role without channels.view is denied even with membership', async () => {
  const editor = await AdminUser.create({ name: 'E', email: `e1-${Date.now()}@example.com`, password: 'x', role: 'editor' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({ workspace: workspaceId, memberType: 'employee', adminUser: editor._id, workspaceRole: 'contributor', status: 'active' });
  const req = reqWithRole('editor', editor._id);
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId)), false);
});

test('channels.view capability without active workspace membership is denied', async () => {
  const pm = await AdminUser.create({ name: 'PM', email: `p1-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  const req = reqWithRole('pm', pm._id);
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId)), false);
});

test('channels.view capability with active workspace membership is allowed for an all_members channel', async () => {
  const pm = await AdminUser.create({ name: 'PM2', email: `p2-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({ workspace: workspaceId, memberType: 'employee', adminUser: pm._id, workspaceRole: 'contributor', status: 'active' });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId)), true);
});

test('a restricted_members channel is denied to a workspace member without an active ChannelMember row', async () => {
  const pm = await AdminUser.create({ name: 'PM3', email: `p3-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  await WorkspaceMember.create({ workspace: workspaceId, memberType: 'employee', adminUser: pm._id, workspaceRole: 'contributor', status: 'active' });
  const req = reqWithRole('pm', pm._id);
  const restricted = channelDoc(workspaceId, { visibility: 'restricted_members' });
  assert.equal(await collaborationPolicy.canViewChannel(req, restricted), false);
});

test('a restricted_members channel is allowed to a workspace member WITH an active ChannelMember row', async () => {
  const pm = await AdminUser.create({ name: 'PM4', email: `p4-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  const member = await WorkspaceMember.create({ workspace: workspaceId, memberType: 'employee', adminUser: pm._id, workspaceRole: 'contributor', status: 'active' });
  const req = reqWithRole('pm', pm._id);
  const restricted = channelDoc(workspaceId, { visibility: 'restricted_members' });
  await ChannelMember.create({ channel: restricted._id, workspaceMember: member._id, status: 'active' });
  assert.equal(await collaborationPolicy.canViewChannel(req, restricted), true);
});

test('channels.view_all (admin) bypasses BOTH the membership requirement and the restricted-channel requirement', async () => {
  const admin = await AdminUser.create({ name: 'Admin', email: `a1-${Date.now()}@example.com`, password: 'x', role: 'admin' });
  const workspaceId = new mongoose.Types.ObjectId();
  const req = reqWithRole('admin', admin._id);
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId)), true);
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId, { visibility: 'restricted_members' })), true);
});

test('a removed workspace membership immediately loses channel access', async () => {
  const pm = await AdminUser.create({ name: 'PM5', email: `p5-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  const membership = await WorkspaceMember.create({ workspace: workspaceId, memberType: 'employee', adminUser: pm._id, workspaceRole: 'contributor', status: 'active' });
  const req = reqWithRole('pm', pm._id);
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId)), true);

  membership.status = 'removed';
  await membership.save();
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(workspaceId)), false);
});

test('a removed ChannelMember (but still-active WorkspaceMember) immediately loses restricted-channel access', async () => {
  const pm = await AdminUser.create({ name: 'PM6', email: `p6-${Date.now()}@example.com`, password: 'x', role: 'pm' });
  const workspaceId = new mongoose.Types.ObjectId();
  const member = await WorkspaceMember.create({ workspace: workspaceId, memberType: 'employee', adminUser: pm._id, workspaceRole: 'contributor', status: 'active' });
  const req = reqWithRole('pm', pm._id);
  const restricted = channelDoc(workspaceId, { visibility: 'restricted_members' });
  const channelMember = await ChannelMember.create({ channel: restricted._id, workspaceMember: member._id, status: 'active' });
  assert.equal(await collaborationPolicy.canViewChannel(req, restricted), true);

  channelMember.status = 'removed';
  channelMember.removedAt = new Date();
  await channelMember.save();
  assert.equal(await collaborationPolicy.canViewChannel(req, restricted), false);
});

test('a missing role (no session) fails closed', async () => {
  const req = { session: {} };
  assert.equal(await collaborationPolicy.canViewChannel(req, channelDoc(new mongoose.Types.ObjectId())), false);
});

test('canAttachDocument denies a document from a different case', () => {
  const channel = { case: new mongoose.Types.ObjectId(), visibility: 'clients_and_team' };
  const document = { case: new mongoose.Types.ObjectId(), status: 'accepted', visibility: 'client_visible' };
  assert.equal(collaborationPolicy.canAttachDocument(channel, document), false);
});

test('canAttachDocument denies a quarantined document', () => {
  const caseId = new mongoose.Types.ObjectId();
  const channel = { case: caseId, visibility: 'clients_and_team' };
  const document = { case: caseId, status: 'quarantined', visibility: 'client_visible' };
  assert.equal(collaborationPolicy.canAttachDocument(channel, document), false);
});

test('canAttachDocument denies an employees_only document in a client-accessible channel', () => {
  const caseId = new mongoose.Types.ObjectId();
  const channel = { case: caseId, visibility: 'clients_and_team' };
  const document = { case: caseId, status: 'accepted', visibility: 'employees_only' };
  assert.equal(collaborationPolicy.canAttachDocument(channel, document), false);
});

test('canAttachDocument allows an employees_only document in an employees_only channel', () => {
  const caseId = new mongoose.Types.ObjectId();
  const channel = { case: caseId, visibility: 'employees_only' };
  const document = { case: caseId, status: 'accepted', visibility: 'employees_only' };
  assert.equal(collaborationPolicy.canAttachDocument(channel, document), true);
});
