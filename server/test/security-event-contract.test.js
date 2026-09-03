const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../../docs/architecture/security-event-contract.json');

const SecurityEvent = require('../models/SecurityEvent');
const { sanitizeMeta, actorFromSession } = require('../utils/securityEvents');
const {
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCK_DURATION_MS,
  isLockedOut,
  failedLoginUpdate,
  successfulLoginUpdate,
} = require('../utils/lockout');

/**
 * The other half of test/security-event-contract.test.ts in the root app.
 * Both applications write `security_events` and both enforce the same
 * lockout on the same AdminUser fields (ADR-012 §1, §3) — a value changed
 * on one side and not the other fails on both.
 */

test('the collection name matches the contract', () => {
  assert.equal(SecurityEvent.collection.collectionName, contract.collections.SecurityEvent);
});

test('event type, result, actor and surface enums match the contract', () => {
  assert.deepEqual(SecurityEvent.SECURITY_EVENT_TYPES, contract.eventTypes);
  assert.deepEqual(SecurityEvent.SECURITY_EVENT_RESULTS, contract.resultValues);
  assert.deepEqual(SecurityEvent.SECURITY_EVENT_ACTOR_TYPES, contract.actorTypeValues);
  assert.deepEqual(SecurityEvent.SECURITY_EVENT_SURFACES, contract.surfaceValues);
});

test('lockout thresholds match the contract', () => {
  assert.equal(MAX_FAILED_LOGIN_ATTEMPTS, contract.lockout.maxFailedAttempts);
  assert.equal(LOCK_DURATION_MS, contract.lockout.lockDurationMs);
});

test('the lockout patch writes exactly the contract\'s counter fields', () => {
  const { patch } = failedLoginUpdate({ failedLoginCount: 0 });
  assert.deepEqual(Object.keys(patch).sort(), [...contract.lockout.counterFields].sort());
});

test('the lock trips on the Nth attempt, not before', () => {
  const account = { failedLoginCount: 0, lockedUntil: null };

  for (let attempt = 1; attempt < contract.lockout.maxFailedAttempts; attempt += 1) {
    const { patch, justLocked } = failedLoginUpdate(account);
    Object.assign(account, patch);
    assert.equal(justLocked, false, `attempt ${attempt} must not lock`);
    assert.equal(isLockedOut(account), false);
  }

  const final = failedLoginUpdate(account);
  assert.equal(final.justLocked, true);
  Object.assign(account, final.patch);
  assert.equal(isLockedOut(account), true);
  assert.equal(account.failedLoginCount, 0);
});

test('a lock expires rather than persisting', () => {
  const now = Date.now();
  const { patch } = failedLoginUpdate({ failedLoginCount: 4 }, now);
  assert.equal(isLockedOut(patch, now + contract.lockout.lockDurationMs - 1000), true);
  assert.equal(isLockedOut(patch, now + contract.lockout.lockDurationMs + 1000), false);
});

test('a successful login clears the lockout', () => {
  const patch = successfulLoginUpdate();
  assert.equal(patch.failedLoginCount, 0);
  assert.equal(patch.lockedUntil, null);
  assert.equal(isLockedOut(patch), false);
});

test('every forbidden meta key is redacted, whatever its casing', () => {
  const dirty = { keptField: 'fine' };
  contract.forbiddenMetaKeys.forEach((key) => {
    dirty[key] = 'super-secret-value';
    dirty[key.toUpperCase()] = 'super-secret-value';
  });

  const clean = sanitizeMeta(dirty);
  assert.equal(clean.keptField, 'fine');
  assert.equal(
    JSON.stringify(clean).includes('super-secret-value'),
    false,
    "a forbidden key's value survived sanitizeMeta"
  );
  contract.forbiddenMetaKeys.forEach((key) => {
    assert.equal(clean[key], '[redacted]', `${key} was not redacted`);
  });
});

test('sanitizeMeta drops nested objects rather than walking them', () => {
  const clean = sanitizeMeta({
    nested: { password: 'hunter2' },
    scalar: 42,
    flag: true,
    list: ['a', 1, { password: 'hunter2' }],
  });

  assert.equal('nested' in clean, false);
  assert.equal(clean.scalar, 42);
  assert.equal(clean.flag, true);
  assert.deepEqual(clean.list, ['a', 1]);
  assert.equal(JSON.stringify(clean).includes('hunter2'), false);
});

test('sanitizeMeta bounds string length so the log cannot be flooded through one field', () => {
  const clean = sanitizeMeta({ blob: 'x'.repeat(10000) });
  assert.equal(clean.blob.length, 500);
});

test('the break-glass login is recorded as env_fallback, never attributed to a person', () => {
  // The env-credential session carries a name but no AdminUser id. It must
  // not be silently recorded as `anonymous` (it is authenticated) nor as
  // `admin_user` (there is no person behind it to hold accountable).
  assert.deepEqual(actorFromSession({ adminUser: { name: 'Admin', role: 'super_admin' } }), {
    actorType: 'env_fallback',
    actorAdminId: null,
    actorName: 'Admin',
  });

  assert.deepEqual(actorFromSession({ adminUser: { id: 'abc123', name: 'Real Person' } }), {
    actorType: 'admin_user',
    actorAdminId: 'abc123',
    actorName: 'Real Person',
  });

  assert.deepEqual(actorFromSession({}), {
    actorType: 'anonymous',
    actorAdminId: null,
    actorName: '',
  });
});

test('the model refuses to update or delete an entry', async () => {
  // Append-only is enforced, not merely documented. A Mongoose query hook
  // fires when the query is EXECUTED, not when it is constructed, so these
  // reject rather than throw synchronously — and they reject before the
  // driver is ever reached, which is why this needs no database.
  await assert.rejects(
    () => SecurityEvent.updateOne({}, { $set: { result: 'success' } }),
    /append-only/
  );
  await assert.rejects(() => SecurityEvent.deleteOne({}), /append-only/);
  await assert.rejects(() => SecurityEvent.deleteMany({}), /append-only/);
  await assert.rejects(() => SecurityEvent.findOneAndUpdate({}, { $set: {} }), /append-only/);
  await assert.rejects(() => SecurityEvent.findOneAndDelete({}), /append-only/);
  await assert.rejects(() => SecurityEvent.replaceOne({}, {}), /append-only/);
});

test('an existing document cannot be re-saved', async () => {
  const doc = new SecurityEvent({
    type: 'login_succeeded',
    result: 'success',
    surface: 'admin_cms',
    actorType: 'admin_user',
  });
  // Pretend it came back from the database rather than being newly built.
  doc.isNew = false;
  await assert.rejects(() => doc.save(), /append-only/);
});
