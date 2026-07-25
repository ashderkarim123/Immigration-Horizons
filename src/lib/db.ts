import "server-only";

import mongoose from "mongoose";

/**
 * Cached MongoDB connection, shared with the legacy Express app and the
 * standalone admin CMS (web/server) — same MONGODB_URI, same database, same
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
