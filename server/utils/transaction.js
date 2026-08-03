const mongoose = require('mongoose');

/**
 * Runs `fn(session)` inside a real MongoDB transaction when the connected
 * deployment supports one (any replica set or sharded cluster — which
 * includes every MongoDB Atlas tier, the real production target per
 * MONGODB_URI), and falls back to running `fn(null)` without a session
 * otherwise (e.g. a standalone `mongodb` for some local dev setups, or
 * standalone `mongodb-memory-server` in tests).
 *
 * The fallback does NOT pretend to be transactional — callers passed
 * `session: null` must rely on unique indexes as the concurrency guard and
 * design each write step to be safe to run without atomicity (see
 * services/caseConversion.js's step-by-step compensating-cleanup comments).
 * This function's job is only to detect which mode is available and report
 * which one ran; it never silently claims success for an operation that
 * partially applied.
 */

let cachedSupport = null; // { forConnection, supportsTransactions } — reset per connection identity

/**
 * Detects transaction support via the deployment's own topology
 * self-report (`hello`/legacy `isMaster`'s `setName` for a replica set, or
 * `msg: 'isdbgrid'` for a mongos router) — a real runtime fact rather than
 * a guess from the connection string, since a standalone-looking
 * `mongodb://` URI can still point at a replica-set member, and vice versa.
 * A transaction only actually engages this machinery on its first write, so
 * probing with a real empty transaction attempt is not reliable; asking the
 * server directly is.
 */
async function detectTransactionSupport() {
  if (cachedSupport && cachedSupport.forConnection === mongoose.connection) {
    return cachedSupport.supportsTransactions;
  }

  let supportsTransactions = false;
  try {
    const result = await mongoose.connection.db.admin().command({ hello: 1 });
    supportsTransactions = Boolean(result.setName) || result.msg === 'isdbgrid';
  } catch (err) {
    // Some deployments/permission sets reject `hello` — treat as
    // unsupported rather than throwing, since this is a capability probe,
    // not a required operation.
    supportsTransactions = false;
  }

  cachedSupport = { forConnection: mongoose.connection, supportsTransactions };
  return supportsTransactions;
}

async function withOptionalTransaction(fn) {
  const supportsTransactions = await detectTransactionSupport();

  if (!supportsTransactions) {
    return { result: await fn(null), transactional: false };
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return { result, transactional: true };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

/** Test-only: clears the cached topology probe (mongoose.connection changes between test files). */
function _resetTransactionSupportCache() {
  cachedSupport = null;
}

module.exports = { withOptionalTransaction, _resetTransactionSupportCache };
