import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/employee-capability-contract.json" with { type: "json" };

import {
  CAPABILITIES,
  ROLE_LABELS,
  ALL_ROLES,
  MANAGER_ROLES,
  SPECIALIST_ROLES,
  READ_ONLY_ROLES,
  roleHasCapability,
  capabilitiesForRole,
} from "../src/lib/auth/capabilities";

/**
 * The SaaS app mirrors the admin CMS's permission map (ADR-009). This is
 * the test that catches drift: a capability granted on one side and not
 * the other fails here and in the matching server-side test.
 */

test("every role and label matches the contract", () => {
  assert.deepEqual(ALL_ROLES, contract.roles);
  assert.deepEqual(ROLE_LABELS, contract.roleLabels);
});

test("role tiers match the contract", () => {
  assert.deepEqual(MANAGER_ROLES, contract.managerRoles);
  assert.deepEqual(SPECIALIST_ROLES, contract.specialistRoles);
  assert.deepEqual(READ_ONLY_ROLES, contract.readOnlyRoles);
});

test("the capability map matches the admin CMS exactly — no extra, no missing", () => {
  const mine = Object.keys(CAPABILITIES).sort();
  const theirs = Object.keys(contract.capabilities).sort();
  assert.deepEqual(mine, theirs, "capability names must match exactly");

  for (const capability of theirs) {
    assert.deepEqual(
      [...CAPABILITIES[capability]].sort(),
      [...(contract.capabilities as Record<string, string[]>)[capability]].sort(),
      `roles granted "${capability}" must match the admin CMS`,
    );
  }
});

test("roleHasCapability fails closed on unknown role and unknown capability", () => {
  assert.equal(roleHasCapability(null, "cases.view"), false);
  assert.equal(roleHasCapability("", "cases.view"), false);
  assert.equal(roleHasCapability("not_a_real_role", "cases.view"), false);
  // A typo'd capability must grant nothing, never everything.
  assert.equal(roleHasCapability("super_admin", "cases.veiw"), false);
  assert.equal(roleHasCapability("super_admin", "cases.view"), true);
});

test("a viewer holds no case-working capability", () => {
  for (const capability of ["cases.view", "documents.review", "messages.send", "queries.answer", "clients.manage"]) {
    assert.equal(roleHasCapability("viewer", capability), false, `viewer must not hold ${capability}`);
  }
});

test("an editor holds content capabilities but no case-working ones", () => {
  assert.equal(roleHasCapability("editor", "blog.manage"), true);
  assert.equal(roleHasCapability("editor", "cases.view"), false);
  assert.equal(roleHasCapability("editor", "documents.view"), false);
});

test("capabilitiesForRole is derived from the same map, not a second list", () => {
  for (const capability of capabilitiesForRole("pm")) {
    assert.ok(roleHasCapability("pm", capability), `${capability} must agree with roleHasCapability`);
  }
  assert.deepEqual(capabilitiesForRole(null), []);
});
