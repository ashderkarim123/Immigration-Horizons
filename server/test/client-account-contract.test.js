const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/architecture/client-account-contract.json'), 'utf8'),
);

const PortalInvitation = require('../models/PortalInvitation');
const ClientSession = require('../models/ClientSession');
const ClientUser = require('../models/ClientUser');
const {
  INVITATION_TTL_MS,
  TOKEN_HASH_ALGORITHM,
  TOKEN_BYTES,
  ADMIN_INVITATION_PURPOSE,
} = require('../utils/clientAccountConstants');
const { generateToken, hashToken, normalizeEmail } = require('../services/clientAccountService');

test('collection names match the contract', () => {
  assert.equal(PortalInvitation.collection.collectionName, contract.collections.PortalInvitation);
  assert.equal(ClientSession.collection.collectionName, contract.collections.ClientSession);
});

test('invitation TTL, token size, and hash algorithm match the contract', () => {
  assert.equal(INVITATION_TTL_MS, contract.invitationTtlMs);
  assert.equal(TOKEN_HASH_ALGORITHM, contract.tokenHashAlgorithm);
  assert.equal(TOKEN_BYTES, contract.tokenBytes);
});

test('invitation purpose enum matches the contract', () => {
  assert.deepEqual([...PortalInvitation.PURPOSE_VALUES], contract.invitationPurposeValues);
  assert.equal(ADMIN_INVITATION_PURPOSE, contract.adminInvitationPurpose);
  assert.ok(contract.invitationPurposeValues.includes(ADMIN_INVITATION_PURPOSE));
});

test('client status enum matches the contract', () => {
  assert.deepEqual([...ClientUser.STATUS_VALUES], contract.clientUserStatusValues);
});

test('generateToken produces a URL-safe token of the declared entropy', () => {
  const token = generateToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'token must be URL-safe base64url');
  // 32 bytes base64url-encodes to 43 characters (no padding).
  assert.equal(token.length, 43);
  assert.notEqual(generateToken(), token, 'tokens must not repeat');
});

test('hashToken is a stable, hex-encoded sha256 digest — and never returns the raw token', () => {
  const token = 'a-known-token-value';
  const hash = hashToken(token);
  assert.equal(hash, hashToken(token), 'hashing must be deterministic');
  assert.match(hash, /^[0-9a-f]{64}$/, 'sha256 hex digest is 64 hex characters');
  assert.notEqual(hash, token);
});

test('normalizeEmail lowercases and trims, matching the portal', () => {
  assert.equal(normalizeEmail('  Client@Example.COM '), 'client@example.com');
});
