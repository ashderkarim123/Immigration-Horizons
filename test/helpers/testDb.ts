import mongoose from "mongoose";

/**
 * Test-database lifecycle for DB-backed integration tests. Mirrors
 * server/test/helpers/testDb.js exactly (same resolution order, same
 * production-URI guard) so both apps' test suites behave identically.
 *
 * Neither path ever reads `MONGODB_URI` (the real app's connection string)
 * — that variable is not consulted anywhere in this file, which is the
 * primary guarantee that integration tests cannot silently fall back to a
 * real database.
 */

let memoryServer: import("mongodb-memory-server").MongoMemoryServer | null = null;

const PRODUCTION_URI_PATTERNS = [
  /mongodb\.net/i,
  /mongodb\+srv:/i,
  /amazonaws\.com/i,
  /azure\.com/i,
  /gcp\.mongodb/i,
  /[/?]prod(uction)?[./?]/i,
];

function assertNotProduction(uri: string) {
  for (const pattern of PRODUCTION_URI_PATTERNS) {
    if (pattern.test(uri)) {
      const redacted = uri.replace(/\/\/[^@/]+@/, "//<redacted>@");
      throw new Error(
        `[test-db] Refusing to run integration tests against TEST_MONGODB_URI because it looks ` +
          `like a production/managed database (matched ${pattern}): ${redacted}\n` +
          "Point TEST_MONGODB_URI at a disposable local MongoDB instance instead, or unset it to " +
          "use mongodb-memory-server.",
      );
    }
  }
}

export async function startTestDb(): Promise<string> {
  if (mongoose.connection.readyState !== 0) {
    throw new Error(
      "[test-db] mongoose already has an active connection — refusing to reconnect mid-suite.",
    );
  }

  let uri = process.env.TEST_MONGODB_URI;

  if (uri) {
    assertNotProduction(uri);
  } else {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    // Each test FILE starts its own instance (node:test runs files in
    // separate processes), so a suite of this size pays the mongod spawn
    // cost a dozen-plus times. The library's 10s default is marginal on a
    // cold Windows filesystem and produced flaky "Instance failed to start"
    // failures that look exactly like real test failures but are not.
    memoryServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });
    uri = memoryServer.getUri();
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  // Application code (src/lib/db.ts's getDb()) gates all DB access behind
  // `process.env.MONGODB_URI` being set, and calls `mongoose.connect()`
  // itself on first use. Setting it to the same already-verified-safe test
  // URI here means that call reuses this exact connection (mongoose is a
  // no-op reconnecting to a URI it's already connected to) instead of
  // skipping — this is the opposite direction of the guarantee in
  // assertNotProduction() above: we are telling the app which already-safe
  // URI to see, never letting the app's real MONGODB_URI leak into a test.
  process.env.MONGODB_URI = uri;

  return uri;
}

export async function stopTestDb(): Promise<void> {
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

export async function clearCollections(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
