const mongoose = require('mongoose');

/**
 * Test-database lifecycle for DB-backed integration tests.
 *
 * Resolution order:
 *   1. `TEST_MONGODB_URI` env var — documented fallback for environments
 *      where `mongodb-memory-server` can't download/run its binary (offline
 *      CI, locked-down sandboxes). See server/README.md.
 *   2. `mongodb-memory-server` — an isolated, ephemeral MongoDB instance
 *      started fresh for the test run and torn down after.
 *
 * Neither path ever reads `MONGODB_URI` (the real app's connection string) —
 * that variable is not consulted anywhere in this file, which is the primary
 * guarantee that integration tests cannot silently fall back to a real
 * database. `assertNotProduction` is a second, independent check specifically
 * against a misconfigured `TEST_MONGODB_URI`.
 */

let memoryServer = null;

// Heuristics for "this URI looks like a real, non-disposable database" —
// deliberately broad. A false positive here just means someone has to name
// their local test URI more obviously as a test database; a false negative
// means integration tests could run destructive writes against production.
const PRODUCTION_URI_PATTERNS = [
  /mongodb\.net/i, // MongoDB Atlas managed clusters
  /mongodb\+srv:/i, // SRV-style URIs are how every managed provider is reached
  /amazonaws\.com/i,
  /azure\.com/i,
  /gcp\.mongodb/i,
  /[/?]prod(uction)?[./?]/i,
];

function assertNotProduction(uri) {
  if (!uri) return;
  for (const pattern of PRODUCTION_URI_PATTERNS) {
    if (pattern.test(uri)) {
      const redacted = uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
      throw new Error(
        `[test-db] Refusing to run integration tests against TEST_MONGODB_URI because it looks ` +
          `like a production/managed database (matched ${pattern}): ${redacted}\n` +
          'Point TEST_MONGODB_URI at a disposable local MongoDB instance instead, or unset it to ' +
          'use mongodb-memory-server.'
      );
    }
  }
}

async function startTestDb() {
  if (mongoose.connection.readyState !== 0) {
    throw new Error('[test-db] mongoose already has an active connection — refusing to reconnect mid-suite.');
  }

  let uri = process.env.TEST_MONGODB_URI;

  if (uri) {
    assertNotProduction(uri);
  } else {
    let MongoMemoryServer;
    try {
      ({ MongoMemoryServer } = require('mongodb-memory-server'));
    } catch (err) {
      throw new Error(
        '[test-db] mongodb-memory-server is not installed and TEST_MONGODB_URI is not set. ' +
          'Run `npm install` in server/, or set TEST_MONGODB_URI to a disposable local MongoDB ' +
          'instance (e.g. mongodb://127.0.0.1:27017/immigration-horizons-test). ' +
          `Original error: ${err.message}`
      );
    }
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return uri;
}

async function stopTestDb() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
  }
}

/** Empties every collection between tests/test files without dropping indexes. */
async function clearCollections() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

module.exports = { startTestDb, stopTestDb, clearCollections, assertNotProduction };
