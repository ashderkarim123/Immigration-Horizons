import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/security-event-contract.json" with { type: "json" };

import {
  SecurityEvent,
  SECURITY_EVENT_TYPES,
  SECURITY_EVENT_RESULTS,
  SECURITY_EVENT_ACTOR_TYPES,
  SECURITY_EVENT_SURFACES,
} from "../src/lib/models/SecurityEvent";
import { sanitizeMeta } from "../src/lib/security/security-events";
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCK_DURATION_MS,
  failedLoginUpdate,
  successfulLoginUpdate,
  isLockedOut,
} from "../src/lib/auth/lockout";

/**
 * The other half of server/test/security-event-contract.test.js. Both
 * applications write `security_events` and both enforce the same lockout
 * on the same AdminUser fields (ADR-012 §1, §3) — these are the tests that
 * catch the two sides drifting apart.
 */

test("the collection name matches the contract", () => {
  assert.equal(SecurityEvent.collection.collectionName, contract.collections.SecurityEvent);
});

test("event type, result, actor and surface enums match the contract", () => {
  assert.deepEqual([...SECURITY_EVENT_TYPES], contract.eventTypes);
  assert.deepEqual([...SECURITY_EVENT_RESULTS], contract.resultValues);
  assert.deepEqual([...SECURITY_EVENT_ACTOR_TYPES], contract.actorTypeValues);
  assert.deepEqual([...SECURITY_EVENT_SURFACES], contract.surfaceValues);
});

test("lockout thresholds match the contract", () => {
  assert.equal(MAX_FAILED_LOGIN_ATTEMPTS, contract.lockout.maxFailedAttempts);
  assert.equal(LOCK_DURATION_MS, contract.lockout.lockDurationMs);
});

test("the lockout patch writes exactly the contract's counter fields", () => {
  const { patch } = failedLoginUpdate({ failedLoginCount: 0 });
  assert.deepEqual(Object.keys(patch).sort(), [...contract.lockout.counterFields].sort());
});

test("the lock trips on the Nth attempt, not before", () => {
  const account: { failedLoginCount: number; lockedUntil: Date | null } = {
    failedLoginCount: 0,
    lockedUntil: null,
  };

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

  // The counter resets so the lock is a delay, not a permanent denial an
  // attacker could hold the account in by continuing to guess.
  assert.equal(account.failedLoginCount, 0);
});

test("a lock expires rather than persisting", () => {
  const now = Date.now();
  const { patch } = failedLoginUpdate({ failedLoginCount: 4 }, now);
  assert.equal(isLockedOut({ ...patch }, now + contract.lockout.lockDurationMs - 1000), true);
  assert.equal(isLockedOut({ ...patch }, now + contract.lockout.lockDurationMs + 1000), false);
});

test("a successful login clears the lockout", () => {
  const patch = successfulLoginUpdate();
  assert.equal(patch.failedLoginCount, 0);
  assert.equal(patch.lockedUntil, null);
  assert.equal(isLockedOut(patch), false);
});

test("every forbidden meta key is redacted, whatever its casing", () => {
  const dirty: Record<string, unknown> = { keptField: "fine" };
  for (const key of contract.forbiddenMetaKeys) {
    dirty[key] = "super-secret-value";
    dirty[key.toUpperCase()] = "super-secret-value";
  }

  const clean = sanitizeMeta(dirty)!;
  assert.equal(clean.keptField, "fine");

  const serialized = JSON.stringify(clean);
  assert.equal(
    serialized.includes("super-secret-value"),
    false,
    "a forbidden key's value survived sanitizeMeta",
  );
  for (const key of contract.forbiddenMetaKeys) {
    assert.equal(clean[key], "[redacted]", `${key} was not redacted`);
  }
});

test("sanitizeMeta drops nested objects rather than walking them", () => {
  // A one-level scan cannot police a nested payload, so nesting is refused
  // outright instead of being trusted.
  const clean = sanitizeMeta({
    nested: { password: "hunter2" },
    scalar: 42,
    flag: true,
    list: ["a", 1, { password: "hunter2" }],
  })!;

  assert.equal("nested" in clean, false);
  assert.equal(clean.scalar, 42);
  assert.equal(clean.flag, true);
  assert.deepEqual(clean.list, ["a", 1]);
  assert.equal(JSON.stringify(clean).includes("hunter2"), false);
});

test("sanitizeMeta bounds string length so the log cannot be flooded through one field", () => {
  const clean = sanitizeMeta({ blob: "x".repeat(10_000) })!;
  assert.equal((clean.blob as string).length, 500);
});

test("empty and non-object metadata normalise to null", () => {
  assert.equal(sanitizeMeta(null), null);
  assert.equal(sanitizeMeta(undefined), null);
  assert.equal(sanitizeMeta({}), null);
  assert.equal(sanitizeMeta({ dropped: { a: 1 } }), null);
});
