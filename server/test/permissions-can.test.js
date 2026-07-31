const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALL_ROLES,
  CAPABILITIES,
  can,
  requireCapability,
  isTaskOwner,
  canManageTask,
} = require('../utils/permissions');

function reqWithRole(role, id) {
  if (role === undefined) return { session: {} }; // no adminUser at all
  return { session: { adminUser: { id: id || 'user-1', name: 'Test User', role } } };
}

test('can(): full role x capability matrix matches CAPABILITIES exactly', () => {
  for (const role of ALL_ROLES) {
    for (const capability of Object.keys(CAPABILITIES)) {
      const expected = role === 'super_admin' || CAPABILITIES[capability].includes(role);
      const actual = can(reqWithRole(role), capability);
      assert.equal(
        actual,
        expected,
        `role="${role}" capability="${capability}" expected ${expected} got ${actual}`
      );
    }
  }
});

test('can(): super_admin bypass is real, not just array membership', () => {
  // Prove the bypass works even for a capability whose array is missing
  // super_admin entirely, not just that every array happens to include it.
  const originalCapabilities = { ...CAPABILITIES };
  CAPABILITIES['__test.no_super_admin_listed'] = ['admin'];
  try {
    assert.equal(can(reqWithRole('super_admin'), '__test.no_super_admin_listed'), true);
  } finally {
    delete CAPABILITIES['__test.no_super_admin_listed'];
    assert.deepEqual(CAPABILITIES, originalCapabilities); // cleanup verified
  }
});

test('can(): missing role (no adminUser on session) denies every capability, including for a request that would otherwise look privileged', () => {
  const req = reqWithRole(undefined);
  for (const capability of Object.keys(CAPABILITIES)) {
    assert.equal(can(req, capability), false, `capability="${capability}" should deny a missing role`);
  }
});

test('can(): role present but explicitly null denies every capability', () => {
  const req = { session: { adminUser: { id: 'u1', name: 'X', role: null } } };
  for (const capability of Object.keys(CAPABILITIES)) {
    assert.equal(can(req, capability), false);
  }
});

test('can(): unknown/made-up role denies every capability', () => {
  const req = reqWithRole('not_a_real_role');
  for (const capability of Object.keys(CAPABILITIES)) {
    assert.equal(can(req, capability), false, `capability="${capability}" should deny an unknown role`);
  }
});

test('can(): missing capability argument denies access for every role, including super_admin', () => {
  for (const role of ALL_ROLES) {
    assert.equal(can(reqWithRole(role), undefined), false);
  }
});

test('can(): unknown capability name denies access for every role, including super_admin', () => {
  for (const role of ALL_ROLES) {
    assert.equal(can(reqWithRole(role), 'totally.made.up.capability'), false, `role="${role}"`);
  }
});

test('requireCapability(): denies with 403 and does not call next() when can() is false', () => {
  const middleware = requireCapability('users.manage');
  const req = reqWithRole('viewer');
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    send(payload) { body = payload; return this; },
  };
  middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.ok(typeof body === 'string' && body.includes('users.manage'));
});

test('requireCapability(): calls next() when can() is true', () => {
  const middleware = requireCapability('users.manage');
  const req = reqWithRole('admin');
  let nextCalled = false;
  const res = {
    status() { throw new Error('should not be called'); },
  };
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireCapability(): missing-role session is denied (never treated as privileged)', () => {
  const middleware = requireCapability('leads.view'); // even the broadest capability
  const req = reqWithRole(undefined);
  let statusCode = null;
  const res = { status(code) { statusCode = code; return this; }, send() { return this; } };
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
});

// --- Task ownership (canManageTask) ---------------------------------------

test('isTaskOwner(): true only when Task.assignee matches the session user id', () => {
  const req = reqWithRole('petition_writer', 'user-42');
  assert.equal(isTaskOwner(req, { assignee: 'user-42' }), true);
  assert.equal(isTaskOwner(req, { assignee: 'someone-else' }), false);
  assert.equal(isTaskOwner(req, { assignee: null }), false);
  assert.equal(isTaskOwner(req, null), false);
});

test('canManageTask(): managers can manage any task regardless of assignee', () => {
  const req = reqWithRole('admin', 'user-1');
  assert.equal(canManageTask(req, { assignee: 'someone-else' }), true);
  assert.equal(canManageTask(req, { assignee: null }), true);
});

test('canManageTask(): specialist/reviewer roles can manage only tasks assigned to them', () => {
  for (const role of ['petition_writer', 'business_plan_specialist', 'recommendation_letter_specialist', 'uscis_forms_specialist', 'evidence_collector', 'reviewer']) {
    const req = reqWithRole(role, 'user-99');
    assert.equal(canManageTask(req, { assignee: 'user-99' }), true, `role="${role}" own task`);
    assert.equal(canManageTask(req, { assignee: 'someone-else' }), false, `role="${role}" someone else's task`);
    assert.equal(canManageTask(req, { assignee: null }), false, `role="${role}" unassigned task`);
  }
});

test('canManageTask(): editor and viewer can never manage a task, even one "assigned" to them', () => {
  for (const role of ['editor', 'viewer']) {
    const req = reqWithRole(role, 'user-7');
    assert.equal(canManageTask(req, { assignee: 'user-7' }), false, `role="${role}"`);
  }
});

test('canManageTask(): missing role denies task management entirely', () => {
  const req = reqWithRole(undefined);
  assert.equal(canManageTask(req, { assignee: 'anyone' }), false);
});
