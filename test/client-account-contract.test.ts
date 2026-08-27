import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/client-account-contract.json" with { type: "json" };

import { PortalInvitation, PORTAL_INVITATION_PURPOSE_VALUES } from "../src/lib/models/PortalInvitation";
import { ClientSession } from "../src/lib/models/ClientSession";
import { CLIENT_USER_STATUS_VALUES } from "../src/lib/models/ClientUser";
import { INVITATION_TTL_MS } from "../src/lib/auth/invitations";
import { generateToken, hashToken, normalizeEmail } from "../src/lib/auth/crypto";

/**
 * The other half of server/test/client-account-contract.test.js. The admin
 * app re-implements this app's token mechanism rather than importing it
 * (ADR-007 §2); these two tests are what catch a drift between them.
 */

test("collection names match the contract", () => {
  assert.equal(PortalInvitation.collection.collectionName, contract.collections.PortalInvitation);
  assert.equal(ClientSession.collection.collectionName, contract.collections.ClientSession);
});

test("invitation TTL matches the contract", () => {
  assert.equal(INVITATION_TTL_MS, contract.invitationTtlMs);
});

test("invitation purpose and client status enums match the contract", () => {
  assert.deepEqual([...PORTAL_INVITATION_PURPOSE_VALUES], contract.invitationPurposeValues);
  assert.deepEqual([...CLIENT_USER_STATUS_VALUES], contract.clientUserStatusValues);
});

test("generateToken and hashToken match the contract's declared shape", () => {
  const token = generateToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(token.length, 43); // 32 bytes, base64url, unpadded

  const hash = hashToken(token);
  assert.equal(hash, hashToken(token));
  assert.match(hash, /^[0-9a-f]{64}$/); // sha256 hex
  assert.notEqual(hash, token);
});

test("normalizeEmail lowercases and trims, matching the admin app", () => {
  assert.equal(normalizeEmail("  Client@Example.COM "), "client@example.com");
});
