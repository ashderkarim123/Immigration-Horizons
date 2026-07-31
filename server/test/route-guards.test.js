const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { requireCapability, canManageTask } = require('../utils/permissions');

/**
 * Route-guard tests.
 *
 * These do NOT boot the real server.js or touch MongoDB — connecting to a
 * real database (or standing up mongodb-memory-server) is a heavier
 * infrastructure change than this isolated authorization patch calls for
 * (see PHASE_2_AUTHORIZATION.md "Known limitations / recommended next
 * phase" for the documented follow-up: full DB-backed integration tests
 * once a test-database story exists for this app).
 *
 * What this DOES test faithfully: the exact same `requireCapability(...)`
 * middleware (imported from utils/permissions.js, not reimplemented) wired
 * onto dummy routes in the same method+path+capability shape as the real
 * routes in routes/admin/index.js and routes/admin/leadOps.js. A session is
 * simulated via a tiny test-only middleware that reads a role from a
 * header — the guard itself is 100% the production code, so a pass/fail
 * here reflects the real authorization boundary, not a reimplementation
 * of it.
 */

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Test-only "session" shim: reads X-Test-Role (and optional X-Test-Id)
  // instead of express-session/cookies, so each request can set the
  // simulated role without real login/cookie plumbing. Not used in the
  // real app — production sessions are unaffected by this file.
  app.use((req, res, next) => {
    const role = req.header('x-test-role');
    req.session = role ? { adminUser: { id: req.header('x-test-id') || 'test-user', name: 'Test', role } } : {};
    next();
  });

  // Mirrors routes/admin/index.js
  app.post('/admin/leads/:id/status', requireCapability('leads.edit'), (req, res) => res.status(200).send('ok'));
  app.post('/admin/leads/:id/notes', requireCapability('notes.create'), (req, res) => res.status(200).send('ok'));
  app.delete('/admin/leads/:id', requireCapability('leads.delete'), (req, res) => res.status(200).send('ok'));
  app.get('/admin/leads/export/csv', requireCapability('csv.export'), (req, res) => res.status(200).send('ok'));
  app.delete('/admin/blog/:id', requireCapability('blog.manage'), (req, res) => res.status(200).send('ok'));
  app.post('/admin/settings', requireCapability('settings.manage'), (req, res) => res.status(200).send('ok'));
  app.post('/admin/users', requireCapability('users.manage'), (req, res) => res.status(200).send('ok'));

  // Mirrors routes/admin/leadOps.js
  app.post('/admin/leads/:id/assign', requireCapability('leads.assign'), (req, res) => res.status(200).send('ok'));

  // Ownership-scoped task route (mirrors PUT /admin/tasks/:id) — loads a
  // fixture "task" by id instead of hitting Mongo.
  const FIXTURE_TASKS = {
    't-owned-by-42': { _id: 't-owned-by-42', assignee: 'user-42' },
    't-owned-by-99': { _id: 't-owned-by-99', assignee: 'user-99' },
  };
  app.put('/admin/tasks/:id', (req, res) => {
    const task = FIXTURE_TASKS[req.params.id];
    if (!task) return res.status(404).send('not found');
    if (!canManageTask(req, task)) return res.status(403).send('forbidden');
    return res.status(200).send('ok');
  });

  return app;
}

const app = buildTestApp();

function as(role, id) {
  const r = request(app);
  return {
    get: (url) => r.get(url).set('x-test-role', role || '').set('x-test-id', id || ''),
    post: (url) => r.post(url).set('x-test-role', role || '').set('x-test-id', id || ''),
    put: (url) => r.put(url).set('x-test-role', role || '').set('x-test-id', id || ''),
    delete: (url) => r.delete(url).set('x-test-role', role || '').set('x-test-id', id || ''),
  };
}

test('viewer cannot delete a lead', async () => {
  const res = await as('viewer').delete('/admin/leads/lead-1');
  assert.equal(res.status, 403);
});

test('viewer cannot change lead status', async () => {
  const res = await as('viewer').post('/admin/leads/lead-1/status');
  assert.equal(res.status, 403);
});

test('viewer cannot create a note', async () => {
  const res = await as('viewer').post('/admin/leads/lead-1/notes');
  assert.equal(res.status, 403);
});

test('viewer cannot delete a blog post', async () => {
  const res = await as('viewer').delete('/admin/blog/post-1');
  assert.equal(res.status, 403);
});

test('viewer cannot modify settings', async () => {
  const res = await as('viewer').post('/admin/settings');
  assert.equal(res.status, 403);
});

test('viewer cannot create a user', async () => {
  const res = await as('viewer').post('/admin/users');
  assert.equal(res.status, 403);
});

test('viewer cannot export CSV', async () => {
  const res = await as('viewer').get('/admin/leads/export/csv');
  assert.equal(res.status, 403);
});

test('editor can manage blog content', async () => {
  const res = await as('editor').delete('/admin/blog/post-1');
  assert.equal(res.status, 200);
});

test('editor cannot delete leads', async () => {
  const res = await as('editor').delete('/admin/leads/lead-1');
  assert.equal(res.status, 403);
});

test('editor cannot change lead status', async () => {
  const res = await as('editor').post('/admin/leads/lead-1/status');
  assert.equal(res.status, 403);
});

test('pm can assign a lead', async () => {
  const res = await as('pm').post('/admin/leads/lead-1/assign');
  assert.equal(res.status, 200);
});

test('pm cannot manage users', async () => {
  const res = await as('pm').post('/admin/users');
  assert.equal(res.status, 403);
});

test('pm can change lead status and export CSV', async () => {
  assert.equal((await as('pm').post('/admin/leads/lead-1/status')).status, 200);
  assert.equal((await as('pm').get('/admin/leads/export/csv')).status, 200);
});

test('admin can perform authorized administrative actions (settings, users)', async () => {
  assert.equal((await as('admin').post('/admin/settings')).status, 200);
  assert.equal((await as('admin').post('/admin/users')).status, 200);
});

test('super_admin can perform every protected action', async () => {
  assert.equal((await as('super_admin').delete('/admin/leads/lead-1')).status, 200);
  assert.equal((await as('super_admin').post('/admin/settings')).status, 200);
  assert.equal((await as('super_admin').post('/admin/users')).status, 200);
  assert.equal((await as('super_admin').delete('/admin/blog/post-1')).status, 200);
});

test('missing-role session is denied on every protected route', async () => {
  for (const [method, url] of [
    ['post', '/admin/leads/lead-1/status'],
    ['post', '/admin/leads/lead-1/notes'],
    ['delete', '/admin/leads/lead-1'],
    ['get', '/admin/leads/export/csv'],
    ['delete', '/admin/blog/post-1'],
    ['post', '/admin/settings'],
    ['post', '/admin/users'],
    ['post', '/admin/leads/lead-1/assign'],
  ]) {
    const res = await as(undefined)[method](url);
    assert.equal(res.status, 403, `${method.toUpperCase()} ${url} should deny a missing-role session`);
  }
});

// --- Ownership-scoped task route -------------------------------------------

test('a specialist can manage a task assigned to them', async () => {
  const res = await as('petition_writer', 'user-42').put('/admin/tasks/t-owned-by-42');
  assert.equal(res.status, 200);
});

test('a specialist cannot manage a task assigned to someone else', async () => {
  const res = await as('petition_writer', 'user-42').put('/admin/tasks/t-owned-by-99');
  assert.equal(res.status, 403);
});

test('a manager can manage any task regardless of assignee', async () => {
  const res = await as('admin', 'someone-else').put('/admin/tasks/t-owned-by-99');
  assert.equal(res.status, 200);
});

test('editor cannot manage a task even if somehow "assigned" to them', async () => {
  const res = await as('editor', 'user-42').put('/admin/tasks/t-owned-by-42');
  assert.equal(res.status, 403);
});
