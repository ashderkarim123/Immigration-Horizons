import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Read-only mirror of server/models/admin/User.js. This app never writes
 * an AdminUser — creating, editing, and deactivating employees stays in
 * the admin CMS. It reads them for two distinct purposes:
 *
 *   1. Client-facing display (Cycle 2): an employee's `name` and
 *      `isActive`, for the portal team page and case pages.
 *   2. Employee authentication (Cycle 8B): `email` + `password` to verify
 *      a sign-in, and `role` to resolve capabilities.
 *
 * `role` and `password` were deliberately absent before Cycle 8B, on the
 * grounds that the client portal must never expose internal role codes.
 * That constraint still holds and is now enforced by projection rather
 * than by omission: **every client-facing query must keep selecting only
 * the fields it needs** (`case-policy.ts` and the portal case page both
 * use `.select("name")`). A client-facing query that starts selecting the
 * whole document would leak role codes — `test/employee-auth.test.ts`
 * asserts the client-visible team serializer never carries one.
 *
 * `password` is bcrypt-hashed by the admin CMS's own pre-save hook. This
 * app only ever compares against it; it must never write the field, or it
 * would double-hash a credential the other app owns.
 */
const AdminUserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // NOT marked required, unlike the admin CMS's own schema. This app
    // never creates an AdminUser, so the CMS owns that validation — and
    // declaring it required here only breaks readers that project a subset
    // of fields (it made every existing case-policy test fail on a seed
    // that legitimately did not need credentials).
    email: { type: String, trim: true, lowercase: true },
    password: { type: String },
    role: { type: String, default: "viewer" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const AdminUser =
  mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema, "adminusers");
