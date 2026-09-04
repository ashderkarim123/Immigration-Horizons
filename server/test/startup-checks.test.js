const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { productionStartupProblems } = require('../utils/startupChecks');

/**
 * The production boot guards had no test, and were wrong in the one
 * configuration the deployment guide actually recommends.
 *
 * The old check required a non-empty ADMIN_PASSWORD. An operator who did the
 * MORE secure thing — set ADMIN_PASSWORD_HASH and no plaintext — hit an
 * empty ADMIN_PASSWORD, and the process exited on first boot. The login
 * route has always preferred the hash, so the guard was demanding a weaker
 * credential the app would then ignore.
 */

const REAL_SECRET = 'f'.repeat(96);
const REAL_HASH = bcrypt.hashSync('a-real-admin-password', 12);
const REAL_ROOT = '/srv/immigration-horizons/shared/private-documents';

/** A configuration with nothing wrong, for tests that vary one thing. */
function validEnv(overrides = {}) {
  return {
    SESSION_SECRET: REAL_SECRET,
    ADMIN_PASSWORD_HASH: REAL_HASH,
    PRIVATE_DOCUMENT_ROOT: REAL_ROOT,
    ...overrides,
  };
}

test('a hash with no plaintext password boots — this is the recommended setup', () => {
  assert.deepEqual(
    productionStartupProblems(validEnv()),
    []
  );
});

test('a plaintext password with no hash also boots', () => {
  // Still supported: the hash is preferred, not mandatory.
  assert.deepEqual(
    productionStartupProblems(validEnv({ ADMIN_PASSWORD_HASH: undefined, ADMIN_PASSWORD: 'a-real-password' })),
    []
  );
});

test('neither credential set is refused', () => {
  const problems = productionStartupProblems(validEnv({ ADMIN_PASSWORD_HASH: undefined }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Neither ADMIN_PASSWORD_HASH nor a real ADMIN_PASSWORD/);
});

test('every documented placeholder password is refused', () => {
  for (const password of ['admin', 'admin123', 'admin123456', '']) {
    const problems = productionStartupProblems(validEnv({ ADMIN_PASSWORD_HASH: undefined, ADMIN_PASSWORD: password }));
    assert.equal(problems.length, 1, `"${password}" should have been refused`);
  }
});

test('a placeholder password is still refused when a VALID hash is absent', () => {
  // Order matters: the hash branch must not let a bad plaintext through.
  const problems = productionStartupProblems(validEnv({ ADMIN_PASSWORD_HASH: undefined, ADMIN_PASSWORD: 'admin' }));
  assert.match(problems[0], /Neither ADMIN_PASSWORD_HASH/);
});

test('a truncated hash is caught rather than failing every login silently', () => {
  // A shortened paste looks plausible and produces no error until someone
  // tries to sign in and simply cannot.
  const problems = productionStartupProblems(validEnv({ ADMIN_PASSWORD_HASH: REAL_HASH.slice(0, 40) }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not a bcrypt hash/);
});

test('a bcrypt hash of any supported prefix is accepted', () => {
  for (const prefix of ['$2a$', '$2b$', '$2y$']) {
    const hash = prefix + REAL_HASH.slice(4);
    assert.deepEqual(
      productionStartupProblems(validEnv({ ADMIN_PASSWORD_HASH: hash })),
      [],
      `${prefix} should be accepted`
    );
  }
});

test('every placeholder session secret is refused', () => {
  for (const secret of ['insecure-dev-secret-change-me', 'change-this-to-a-long-random-string', '']) {
    const problems = productionStartupProblems(validEnv({ SESSION_SECRET: secret }));
    assert.equal(problems.length, 1, `"${secret}" should have been refused`);
    assert.match(problems[0], /SESSION_SECRET/);
  }
});

test('both problems are reported together, not one at a time', () => {
  // An operator fixing a deployment should see everything wrong in one pass
  // rather than restarting to discover the next fault.
  const problems = productionStartupProblems({});
  assert.equal(problems.length, 3);
});

test('every message gives the operator something to act on', () => {
  // A refusal that only says "this is wrong" sends someone back to the docs.
  // Each one must carry either a command that generates a valid value, or a
  // concrete example of one.
  const problems = productionStartupProblems({});
  assert.ok(problems.length > 0);
  for (const problem of problems) {
    const actionable = /node -e/.test(problem) || /^\s*[A-Z_]+=\S+/m.test(problem);
    assert.ok(actionable, `no command or example value in: ${problem.slice(0, 60)}`);
  }
});

test('a missing PRIVATE_DOCUMENT_ROOT is caught here rather than as an import crash', () => {
  // The document services build a storage provider at module load, so
  // without this check the process dies inside require('./app') with a bare
  // stack trace — and the symptom is "the admin CMS just doesn't start"
  // while the website beside it works fine. That cost a real deployment an
  // hour of guessing at the wrong variable.
  const problems = productionStartupProblems(validEnv({ PRIVATE_DOCUMENT_ROOT: undefined }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PRIVATE_DOCUMENT_ROOT is not set/);
  assert.match(problems[0], /shared\/private-documents/, 'should show a usable value');
});

test('a relative PRIVATE_DOCUMENT_ROOT is refused, and the bad value is quoted back', () => {
  const problems = productionStartupProblems(validEnv({ PRIVATE_DOCUMENT_ROOT: './documents' }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /absolute path/);
  assert.match(problems[0], /\.\/documents/, 'naming the value is what makes a typo findable');
});
