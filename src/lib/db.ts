import "server-only";

import mongoose from "mongoose";

/**
 * Cached MongoDB connection, shared with the legacy Express app (separate
 * repo) and the standalone admin CMS (server/) — same MONGODB_URI, same database, same
 * `consultations` collection, so leads submitted here show up in the admin
 * Leads dashboard.
 *
 * Cached on `globalThis` because Next.js dev mode re-evaluates modules on
 * every hot reload; without this a new connection would be opened per edit.
 */

type GlobalWithMongoose = typeof globalThis & {
  _mongooseConn?: Promise<typeof mongoose>;
};

const g = globalThis as GlobalWithMongoose;

// Mongoose's default (autoIndex: true) silently builds every schema.index()
// in the background on connect — including in production, on every
// restart/deploy, with no backup/low-traffic/monitoring plan. Matches
// server/config/db.js's identical guard: index creation belongs behind the
// explicit `npm run db:indexes` step (see scripts/createIndexes.ts), not an
// unobserved side effect of the app booting. Local dev and tests keep the
// default (auto-building on every schema change is genuinely convenient
// there, and the data is disposable).
mongoose.set("autoIndex", process.env.NODE_ENV !== "production");

export function getDb(): Promise<typeof mongoose> | null {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn(
      "[db] MONGODB_URI is not set. Leads will still be emailed but not persisted.",
    );
    return null;
  }

  if (!g._mongooseConn) {
    g._mongooseConn = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000 })
      .then((m) => {
        console.log("[db] Connected to MongoDB");
        return m;
      })
      .catch((err) => {
        console.error("[db] Failed to connect to MongoDB:", err.message);
        // Reset so the next call retries rather than reusing a dead promise.
        g._mongooseConn = undefined;
        throw err;
      });
  }

  return g._mongooseConn;
}
