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

test('a hash with no plaintext password boots — this is the recommended setup', () => {
  assert.deepEqual(
    productionStartupProblems({ SESSION_SECRET: REAL_SECRET, ADMIN_PASSWORD_HASH: REAL_HASH }),
    []
  );
});

test('a plaintext password with no hash also boots', () => {
  // Still supported: the hash is preferred, not mandatory.
  assert.deepEqual(
    productionStartupProblems({ SESSION_SECRET: REAL_SECRET, ADMIN_PASSWORD: 'a-real-password' }),
    []
  );
});

test('neither credential set is refused', () => {
  const problems = productionStartupProblems({ SESSION_SECRET: REAL_SECRET });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Neither ADMIN_PASSWORD_HASH nor a real ADMIN_PASSWORD/);
});

test('every documented placeholder password is refused', () => {
  for (const password of ['admin', 'admin123', 'admin123456', '']) {
    const problems = productionStartupProblems({ SESSION_SECRET: REAL_SECRET, ADMIN_PASSWORD: password });
    assert.equal(problems.length, 1, `"${password}" should have been refused`);
  }
});

test('a placeholder password is still refused when a VALID hash is absent', () => {
  // Order matters: the hash branch must not let a bad plaintext through.
  const problems = productionStartupProblems({
    SESSION_SECRET: REAL_SECRET,
    ADMIN_PASSWORD: 'admin',
  });
  assert.match(problems[0], /Neither ADMIN_PASSWORD_HASH/);
});

test('a truncated hash is caught rather than failing every login silently', () => {
  // A shortened paste looks plausible and produces no error until someone
  // tries to sign in and simply cannot.
  const problems = productionStartupProblems({
    SESSION_SECRET: REAL_SECRET,
    ADMIN_PASSWORD_HASH: REAL_HASH.slice(0, 40),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not a bcrypt hash/);
});

test('a bcrypt hash of any supported prefix is accepted', () => {
  for (const prefix of ['$2a$', '$2b$', '$2y$']) {
    const hash = prefix + REAL_HASH.slice(4);
    assert.deepEqual(
      productionStartupProblems({ SESSION_SECRET: REAL_SECRET, ADMIN_PASSWORD_HASH: hash }),
      [],
      `${prefix} should be accepted`
    );
  }
});

test('every placeholder session secret is refused', () => {
  for (const secret of ['insecure-dev-secret-change-me', 'change-this-to-a-long-random-string', '']) {
    const problems = productionStartupProblems({ SESSION_SECRET: secret, ADMIN_PASSWORD_HASH: REAL_HASH });
    assert.equal(problems.length, 1, `"${secret}" should have been refused`);
    assert.match(problems[0], /SESSION_SECRET/);
  }
});

test('both problems are reported together, not one at a time', () => {
  // An operator fixing a deployment should see everything wrong in one pass
  // rather than restarting to discover the next fault.
  const problems = productionStartupProblems({});
  assert.equal(problems.length, 2);
});

test('every message names the variable and how to generate a value', () => {
  const problems = productionStartupProblems({});
  for (const problem of problems) {
    assert.match(problem, /node -e/, 'a refusal should say how to produce a correct value');
  }
});
