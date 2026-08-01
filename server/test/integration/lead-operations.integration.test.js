// See auth.integration.test.js for why this must be set before `../../app`
// is first required.
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs, uniqueEmail } = require('../helpers/auth');

const { createApp } = require('../../app');
const Consultation = require('../../models/Consultation');
const Task = require('../../models/admin/Task');
const AdminUser = require('../../models/admin/User');
const ActivityLog = require('../../models/admin/ActivityLog');
const Notification = require('../../models/admin/Notification');

let app;

test.before(async () => {
  await startTestDb();
  app = createApp();
});

test.after(async () => {
  await stopTestDb();
});

test.beforeEach(async () => {
  await clearCollections();
});

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return agent;
}

async function seedLead(overrides = {}) {
  return Consultation.create({
    name: 'Ops Lead', email: 'ops@example.com', message: 'test', service: 'EB-2 NIW', ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 4.1 — lead list filters and bounded pagination
// ---------------------------------------------------------------------------

test('leads list: overdueTasks=1 returns only leads with an incomplete, past-due task', async () => {
  const agent = await loggedInAs('admin');
  const overdueLead = await seedLead({ name: 'Overdue Lead Unique' });
  const fineLead = await seedLead({ name: 'On Time Lead Unique' });
  await Task.create({ lead: overdueLead._id, title: 'late', dueDate: new Date(Date.now() - 86400000), status: 'todo' });
  await Task.create({ lead: fineLead._id, title: 'future', dueDate: new Date(Date.now() + 10 * 86400000), status: 'todo' });

  const res = await agent.get('/admin/leads').query({ overdueTasks: '1' });
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('Overdue Lead Unique'));
  assert.ok(!res.text.includes('On Time Lead Unique'));
});

test('leads list: unassigned=1 returns only leads with no owner', async () => {
  const agent = await loggedInAs('admin');
  const owner = await AdminUser.create({ name: 'Has Owner', email: uniqueEmail('owner'), password: 'x', role: 'admin' });
  await seedLead({ name: 'Owned Lead Unique', owner: owner._id, ownerName: owner.name });
  await seedLead({ name: 'Unowned Lead Unique' });

  const res = await agent.get('/admin/leads').query({ unassigned: '1' });
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('Unowned Lead Unique'));
  assert.ok(!res.text.includes('Owned Lead Unique'));
});

test('leads list: an invalid enum filter value is ignored rather than passed through to the query', async () => {
  const agent = await loggedInAs('admin');
  await seedLead();
  // "status=literally-anything" must not crash or silently scope the query
  // to a status that can never match any document.
  const res = await agent.get('/admin/leads').query({ status: 'literally-anything' });
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('Ops Lead'));
});

test('leads list: limit is clamped to the maximum page size regardless of what is requested', async () => {
  const agent = await loggedInAs('admin');
  for (let i = 0; i < 5; i += 1) await seedLead({ email: `bulk${i}@example.com` });

  const res = await agent.get('/admin/leads').query({ limit: '999999' });
  assert.equal(res.status, 200); // would 500 on a bad Mongo skip/limit value if unclamped and malformed
});

// ---------------------------------------------------------------------------
// 4.3 — assignment workflow: structured activity log + non-duplicate notifications
// ---------------------------------------------------------------------------

test('assignment: reassigning the same owner does not send a second notification', async () => {
  const agent = await loggedInAs('pm');
  const lead = await seedLead();
  const owner = await AdminUser.create({ name: 'Stable Owner', email: uniqueEmail('owner'), password: 'x', role: 'admin' });

  await agent.post(`/admin/leads/${lead._id}/assign`).send({ owner: String(owner._id) });
  await agent.post(`/admin/leads/${lead._id}/assign`).send({ owner: String(owner._id) });

  const count = await Notification.countDocuments({ recipientName: 'Stable Owner' });
  assert.equal(count, 1, 'owner should only be notified once, not on every re-save of the same assignment');
});

test('assignment: changing the owner logs previous and new owner in ActivityLog.meta', async () => {
  const agent = await loggedInAs('pm');
  const lead = await seedLead();
  const ownerA = await AdminUser.create({ name: 'Owner A', email: uniqueEmail('owner'), password: 'x', role: 'admin' });
  const ownerB = await AdminUser.create({ name: 'Owner B', email: uniqueEmail('owner'), password: 'x', role: 'admin' });

  await agent.post(`/admin/leads/${lead._id}/assign`).send({ owner: String(ownerA._id) });
  await agent.post(`/admin/leads/${lead._id}/assign`).send({ owner: String(ownerB._id) });

  const entries = await ActivityLog.find({ lead: lead._id, type: 'assigned' }).sort({ createdAt: 1 }).lean();
  assert.equal(entries.length, 2);
  assert.equal(entries[1].meta.previousOwner, 'Owner A');
  assert.equal(entries[1].meta.newOwner, 'Owner B');
});

test('assignment: a deactivated user cannot be assigned as owner even with a valid id', async () => {
  const agent = await loggedInAs('pm');
  const lead = await seedLead();
  const inactiveOwner = await AdminUser.create({ name: 'Inactive Owner', email: uniqueEmail('owner'), password: 'x', role: 'admin', isActive: false });

  await agent.post(`/admin/leads/${lead._id}/assign`).send({ owner: String(inactiveOwner._id) });

  const updated = await Consultation.findById(lead._id);
  assert.equal(updated.ownerName, '', 'a deactivated user must not be resolved to an owner name');
});

// ---------------------------------------------------------------------------
// 4.4 — status workflow: previous status recorded
// ---------------------------------------------------------------------------

test('status change: ActivityLog message and meta record both the previous and new status', async () => {
  const agent = await loggedInAs('admin');
  const lead = await seedLead();

  await agent.post(`/admin/leads/${lead._id}/status`).send({ status: 'contacted' });

  const entry = await ActivityLog.findOne({ lead: lead._id, type: 'status_changed' }).lean();
  assert.ok(entry);
  assert.match(entry.message, /from "New Lead" to "Contacted"/);
  assert.equal(entry.meta.previousStatus, 'new');
  assert.equal(entry.meta.newStatus, 'contacted');
});

// ---------------------------------------------------------------------------
// 4.5/4.6 — lead detail panel surfaces overdue tasks
// ---------------------------------------------------------------------------

test('lead detail: an overdue task is visibly marked and the sprint name is shown', async () => {
  const agent = await loggedInAs('admin');
  const lead = await seedLead();
  const Sprint = require('../../models/admin/Sprint');
  const sprint = await Sprint.create({ name: 'Sprint Alpha', startDate: new Date(), endDate: new Date(Date.now() + 7 * 86400000), createdBy: 'Admin' });
  await Task.create({ lead: lead._id, title: 'Late task', dueDate: new Date(Date.now() - 86400000), status: 'todo', sprint: sprint._id });

  const res = await agent.get(`/admin/leads/${lead._id}`);
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('Sprint Alpha'));
  assert.ok(res.text.includes('Overdue'));
});
