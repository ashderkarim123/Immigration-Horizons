/**
 * Cross-app schema-contract test — see
 * docs/architecture/ADR-002-case-workspace-domain.md §4/§8. Asserts this
 * app's own case/workspace/membership models and constants match the
 * canonical contract fixture that test/case-schema-contract.test.ts (root)
 * also loads and checks — so a change to one side's schema without
 * updating the fixture (and thus, presumably, the other side too) fails
 * loudly here rather than drifting silently.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/architecture/case-schema-contract.json'), 'utf8'),
);

const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const ClientUser = require('../models/ClientUser');
const CaseActivity = require('../models/CaseActivity');
const {
  CASE_TYPE_VALUES,
  CASE_STAGE_VALUES,
  WORKSPACE_STATUSES,
  WORKSPACE_TYPES,
  MEMBER_TYPES,
  WORKSPACE_ROLES,
  MEMBERSHIP_STATUSES,
} = require('../utils/caseConstants');

test('collection names match the contract', () => {
  assert.equal(ClientCase.collection.collectionName, contract.collections.ClientCase);
  assert.equal(CaseWorkspace.collection.collectionName, contract.collections.CaseWorkspace);
  assert.equal(WorkspaceMember.collection.collectionName, contract.collections.WorkspaceMember);
  assert.equal(ClientUser.collection.collectionName, contract.collections.ClientUser);
  assert.equal(CaseActivity.collection.collectionName, contract.collections.CaseActivity);
});

// Cycle 8C made the SaaS app a second writer to case_activities
// (ADR-010 3), so the type enum is now a cross-app contract rather than
// a detail owned by this app alone.
test('case activity type enum matches the contract', () => {
  assert.deepEqual(CaseActivity.TYPES, contract.caseActivityTypes);
});

test('case activity actor-type enum matches the contract', () => {
  assert.deepEqual(
    CaseActivity.schema.path('actorType').options.enum,
    contract.caseActivityActorTypes,
  );
});

test('case type enum matches the contract', () => {
  assert.deepEqual(CASE_TYPE_VALUES, contract.caseTypeValues);
  assert.deepEqual(ClientCase.schema.path('caseType').enumValues, contract.caseTypeValues);
});

test('case stage enum matches the contract', () => {
  assert.deepEqual(CASE_STAGE_VALUES, contract.caseStageValues);
  assert.deepEqual(ClientCase.schema.path('currentStage').enumValues, contract.caseStageValues);
});

test('workspace status/type enums match the contract', () => {
  assert.deepEqual(WORKSPACE_STATUSES, contract.workspaceStatusValues);
  assert.deepEqual(WORKSPACE_TYPES, contract.workspaceTypeValues);
  assert.deepEqual(CaseWorkspace.schema.path('status').enumValues, contract.workspaceStatusValues);
  assert.deepEqual(CaseWorkspace.schema.path('workspaceType').enumValues, contract.workspaceTypeValues);
});

test('membership member-type/role/status enums match the contract', () => {
  assert.deepEqual(MEMBER_TYPES, contract.memberTypeValues);
  assert.deepEqual(WORKSPACE_ROLES, contract.workspaceRoleValues);
  assert.deepEqual(MEMBERSHIP_STATUSES, contract.membershipStatusValues);
  assert.deepEqual(WorkspaceMember.schema.path('memberType').enumValues, contract.memberTypeValues);
  assert.deepEqual(WorkspaceMember.schema.path('workspaceRole').enumValues, contract.workspaceRoleValues);
  assert.deepEqual(WorkspaceMember.schema.path('status').enumValues, contract.membershipStatusValues);
});

test('ClientUser status enum matches the contract', () => {
  assert.deepEqual(ClientUser.STATUS_VALUES, contract.clientUserStatusValues);
  assert.deepEqual(ClientUser.schema.path('status').enumValues, contract.clientUserStatusValues);
});

test('required-field sets both apps rely on are present', () => {
  // Fields the Next.js side actually reads (see src/lib/models/ClientCase.ts
  // etc.) — a rename here without updating the mirror would break the
  // portal silently; this pins the minimum both sides depend on.
  const requiredOnClientCase = ['caseNumber', 'title', 'caseType', 'primaryClient'];
  for (const field of requiredOnClientCase) {
    assert.ok(ClientCase.schema.path(field), `ClientCase.${field} must exist`);
  }
  const requiredOnWorkspaceMember = ['workspace', 'memberType', 'workspaceRole', 'status'];
  for (const field of requiredOnWorkspaceMember) {
    assert.ok(WorkspaceMember.schema.path(field), `WorkspaceMember.${field} must exist`);
  }
});
