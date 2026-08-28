const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/architecture/employee-capability-contract.json'), 'utf8'),
);

const permissions = require('../utils/permissions');

/**
 * The admin CMS owns the permission map; the SaaS app mirrors it
 * (ADR-009). This is the server half of the drift guard — its counterpart
 * is test/employee-capability-contract.test.ts. Adding a capability here
 * without adding it there (or vice versa) fails both.
 */

test('roles, labels, and tiers match the contract', () => {
  assert.deepEqual(permissions.ALL_ROLES, contract.roles);
  assert.deepEqual(permissions.ROLE_LABELS, contract.roleLabels);
  assert.deepEqual(permissions.MANAGER_ROLES, contract.managerRoles);
  assert.deepEqual(permissions.SPECIALIST_ROLES, contract.specialistRoles);
  assert.deepEqual(permissions.READ_ONLY_ROLES, contract.readOnlyRoles);
});

test('the capability map matches the contract exactly — no extra, no missing', () => {
  const mine = Object.keys(permissions.CAPABILITIES).sort();
  const theirs = Object.keys(contract.capabilities).sort();
  assert.deepEqual(mine, theirs, 'capability names must match exactly');

  for (const capability of theirs) {
    assert.deepEqual(
      [...permissions.CAPABILITIES[capability]].sort(),
      [...contract.capabilities[capability]].sort(),
      `roles granted "${capability}" must match the contract`,
    );
  }
});

test('every capability grants only real roles', () => {
  for (const [capability, roles] of Object.entries(permissions.CAPABILITIES)) {
    for (const role of roles) {
      assert.ok(
        permissions.ALL_ROLES.includes(role),
        `"${capability}" grants "${role}", which is not a declared role`,
      );
    }
  }
});
