import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/case-schema-contract.json" with { type: "json" };

import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { ClientUser } from "../src/lib/models/ClientUser";
import {
  CASE_TYPE_VALUES,
  CASE_STAGE_VALUES,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
  MEMBER_TYPES,
  WORKSPACE_ROLES,
  MEMBERSHIP_STATUSES,
} from "../src/lib/content/case-constants";

/**
 * Root-side half of the cross-app schema-contract check — see
 * docs/architecture/ADR-002-case-workspace-domain.md §4/§8 and
 * server/test/case-schema-contract.test.js (the other half).
 */

test("collection names match the contract", () => {
  assert.equal(ClientCase.collection.collectionName, contract.collections.ClientCase);
  assert.equal(CaseWorkspace.collection.collectionName, contract.collections.CaseWorkspace);
  assert.equal(WorkspaceMember.collection.collectionName, contract.collections.WorkspaceMember);
  assert.equal(ClientUser.collection.collectionName, contract.collections.ClientUser);
});

test("case type enum matches the contract", () => {
  assert.deepEqual(CASE_TYPE_VALUES, contract.caseTypeValues);
});

test("case stage enum matches the contract", () => {
  assert.deepEqual(CASE_STAGE_VALUES, contract.caseStageValues);
});

test("workspace status/type enums match the contract", () => {
  assert.deepEqual(WORKSPACE_STATUSES, contract.workspaceStatusValues);
  assert.deepEqual(WORKSPACE_TYPES, contract.workspaceTypeValues);
});

test("membership member-type/role/status enums match the contract", () => {
  assert.deepEqual(MEMBER_TYPES, contract.memberTypeValues);
  assert.deepEqual(WORKSPACE_ROLES, contract.workspaceRoleValues);
  assert.deepEqual(MEMBERSHIP_STATUSES, contract.membershipStatusValues);
});

test("required-field sets both apps rely on are present", () => {
  const requiredOnClientCase = ["caseNumber", "title", "caseType", "primaryClient"];
  for (const field of requiredOnClientCase) {
    assert.ok(ClientCase.schema.path(field), `ClientCase.${field} must exist`);
  }
  const requiredOnWorkspaceMember = ["workspace", "memberType", "workspaceRole", "status"];
  for (const field of requiredOnWorkspaceMember) {
    assert.ok(WorkspaceMember.schema.path(field), `WorkspaceMember.${field} must exist`);
  }
});
