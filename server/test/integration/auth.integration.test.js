// Must be set before `../../app` (and therefore routes/admin/index.js,
// where the login rate limiter is constructed) is first required — this
// suite logs in via the real route far more times per run than the
// production limiter (10 / 15 min) allows, all from the same loopback IP.
process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs, uniqueEmail } = require('../helpers/auth');

const { createApp } = require('../../app');
const AdminUser = require('../../models/admin/User');
const Consultation = require('../../models/Consultation');
const BlogPost = require('../../models/BlogPost');
const InternalNote = require('../../models/admin/InternalNote');
const Setting = require('../../models/admin/Setting');

/**
 * DB-backed authorization integration tests.
 *
 * Unlike test/route-guards.test.js (which wires the real requireCapability
 * middleware onto dummy routes with a header-based session shim — see that
 * file's own docblock), everything here goes through the REAL app
 * (server/app.js), the REAL POST /admin/login route, a REAL express-session
 * cookie, and a REAL MongoDB (mongodb-memory-server, or TEST_MONGODB_URI —
 * see test/helpers/testDb.js). No middleware is called directly and no
 * session is hand-constructed for an authenticated user; the only session
 * data used to bypass a real login is a single fail-closed scenario (missing
 * role) that requires a corrupted-looking DB row on purpose — see below.
 */

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

async function seedLead(overrides = {}) {
  return Consultation.create({
    name: 'Jane Applicant',
    email: 'jane@example.com',
    message: 'Looking for EB-2 NIW help.',
    service: 'EB-2 NIW',
    ...overrides,
  });
}

async function loggedInAs(role) {
  const agent = request.agent(app);
  const creds = await seedAdminUser({ role });
  await loginAs(agent, creds);
  return agent;
}

// ---------------------------------------------------------------------------
// Authentication is required before authorization
// ---------------------------------------------------------------------------

test('an unauthenticated request is redirected to login, not evaluated for authorization', async () => {
  const res = await request(app).get('/admin/leads');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/admin\/login/);
});

test('an unauthenticated POST to a protected mutation route is redirected to login, not 403', async () => {
  const lead = await seedLead();
  const res = await request(app).post(`/admin/leads/${lead._id}/status`).send({ status: 'contacted' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/admin\/login/);
  const unchanged = await Consultation.findById(lead._id);
  assert.equal(unchanged.status, 'new');
});

// ---------------------------------------------------------------------------
// Viewer restrictions (real login, real session, real DB)
// ---------------------------------------------------------------------------

test('viewer: real request is denied for every restricted mutation, and the DB is unchanged', async () => {
  const agent = await loggedInAs('viewer');
  const lead = await seedLead();

  const attempts = [
    () => agent.post(`/admin/leads/${lead._id}/status`).send({ status: 'contacted' }),
    () => agent.post(`/admin/leads/${lead._id}/notes`).send({ content: 'hello' }),
    () => agent.delete(`/admin/leads/${lead._id}`),
    () => agent.post('/admin/blog').field('title', 'X').field('excerpt', 'Y').field('content', 'Z'),
    () => agent.post('/admin/testimonials').field('name', 'X').field('review', 'Y'),
    () => agent.post('/admin/faqs').send({ question: 'Q', answer: 'A' }),
    () => agent.post('/admin/settings').send({ group: 'general', siteName: 'Hacked' }),
    () => agent.post('/admin/users').send({ name: 'New', email: uniqueEmail('viewer-created'), password: 'x', role: 'admin' }),
    () => agent.get('/admin/leads/export/csv'),
  ];

  for (const attempt of attempts) {
    const res = await attempt();
    assert.equal(res.status, 403, `expected 403, got ${res.status} for ${res.request.method} ${res.request.url}`);
  }

  const stillNew = await Consultation.findById(lead._id);
  assert.equal(stillNew.status, 'new');
  assert.equal(await InternalNote.countDocuments({ leadId: lead._id }), 0);
  assert.equal(await BlogPost.countDocuments(), 0);
  assert.equal(await Setting.countDocuments(), 0);
  assert.equal(await AdminUser.countDocuments({ role: 'admin' }), 0);
});

// ---------------------------------------------------------------------------
// Authorized-role success, verified against real stored documents
// ---------------------------------------------------------------------------

test('admin: changing lead status is persisted to MongoDB', async () => {
  const agent = await loggedInAs('admin');
  const lead = await seedLead();

  const res = await agent.post(`/admin/leads/${lead._id}/status`).send({ status: 'contacted' });
  assert.equal(res.status, 302);

  const updated = await Consultation.findById(lead._id);
  assert.equal(updated.status, 'contacted');
});

test('super_admin: deleting a lead removes it (and its notes) from MongoDB', async () => {
  const agent = await loggedInAs('super_admin');
  const lead = await seedLead();
  await InternalNote.create({ leadId: lead._id, author: 'Admin', content: 'note' });

  const res = await agent.delete(`/admin/leads/${lead._id}`);
  assert.equal(res.status, 302);

  assert.equal(await Consultation.findById(lead._id), null);
  assert.equal(await InternalNote.countDocuments({ leadId: lead._id }), 0);
});

test('pm: assigning a lead persists owner and stage advance to MongoDB', async () => {
  const agent = await loggedInAs('pm');
  const lead = await seedLead();
  const owner = await AdminUser.create({ name: 'Owner Person', email: uniqueEmail('owner'), password: 'x', role: 'admin' });

  const res = await agent.post(`/admin/leads/${lead._id}/assign`).send({ owner: String(owner._id) });
  assert.equal(res.status, 302);

  const updated = await Consultation.findById(lead._id);
  assert.equal(String(updated.owner), String(owner._id));
  assert.equal(updated.ownerName, 'Owner Person');
});

test('pm: cannot manage users even though pm can assign leads', async () => {
  const agent = await loggedInAs('pm');
  const res = await agent.get('/admin/users');
  assert.equal(res.status, 403);
});

test('editor: creating a FAQ is persisted to MongoDB', async () => {
  const agent = await loggedInAs('editor');
  const res = await agent.post('/admin/faqs').send({ question: 'Do you offer legal representation?', answer: 'No — consulting and paralegal support only.' });
  assert.equal(res.status, 302);

  const FAQ = require('../../models/admin/FAQ');
  const count = await FAQ.countDocuments({ question: /legal representation/ });
  assert.equal(count, 1);
});

test('editor: cannot edit lead status', async () => {
  const agent = await loggedInAs('editor');
  const lead = await seedLead();
  const res = await agent.post(`/admin/leads/${lead._id}/status`).send({ status: 'contacted' });
  assert.equal(res.status, 403);
  const unchanged = await Consultation.findById(lead._id);
  assert.equal(unchanged.status, 'new');
});

test('note creation persists a real InternalNote document', async () => {
  const agent = await loggedInAs('admin');
  const lead = await seedLead();
  const res = await agent.post(`/admin/leads/${lead._id}/notes`).send({ content: 'Called client, left voicemail.' });
  assert.equal(res.status, 302);

  const notes = await InternalNote.find({ leadId: lead._id }).lean();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].content, 'Called client, left voicemail.');
});

test('settings.manage: an admin update upserts a real Setting document', async () => {
  const agent = await loggedInAs('admin');
  const res = await agent.post('/admin/settings').send({ group: 'general', siteName: 'Immigration Horizons' });
  assert.equal(res.status, 302);

  const setting = await Setting.findOne({ group: 'general', key: 'siteName' });
  assert.ok(setting);
  assert.equal(setting.value, 'Immigration Horizons');
});

// ---------------------------------------------------------------------------
// Fail-closed: a real, DB-backed AdminUser row with a missing/unknown role
// ---------------------------------------------------------------------------
//
// The real login routes never produce a session without a role — every path
// sets `adminUser.role` from a valid, schema-enum'd AdminUser document. To
// exercise the fail-closed guarantee end-to-end (not just via the permissions
// unit tests) without hand-constructing a session, this seeds an AdminUser
// row directly at the driver level with `role: null` / an unrecognized role
// string — bypassing Mongoose's schema-level enum validation the same way a
// legacy row, a partial migration, or manual DB surgery could — then logs in
// through the REAL /admin/login route against that real row.

const bcrypt = require('bcryptjs');

async function seedRawRoleUser(role) {
  const password = 'Test-Password-123!';
  const hash = await bcrypt.hash(password, 10);
  const email = uniqueEmail('raw-role');
  await mongoose.connection.collection('adminusers').insertOne({
    name: 'Legacy Row',
    email,
    password: hash,
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { email, password };
}

test('fail-closed: a real login with a missing role is denied every protected action, never treated as super_admin', async () => {
  const agent = request.agent(app);
  const creds = await seedRawRoleUser(null);
  await loginAs(agent, creds);
  const lead = await seedLead();

  const res = await agent.post(`/admin/leads/${lead._id}/status`).send({ status: 'contacted' });
  assert.equal(res.status, 403);
  const unchanged = await Consultation.findById(lead._id);
  assert.equal(unchanged.status, 'new');
});

test('fail-closed: a real login with an unrecognized role string is denied, not treated as any known role', async () => {
  const agent = request.agent(app);
  const creds = await seedRawRoleUser('database_administrator_typo');
  await loginAs(agent, creds);

  const res = await agent.get('/admin/leads/export/csv');
  assert.equal(res.status, 403);
});
