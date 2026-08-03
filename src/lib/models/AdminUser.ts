import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Minimal read-only mirror of server/models/admin/User.js — this app only
 * ever needs an employee's display name (for client-visible team display)
 * and active status (eligibility). Deliberately does NOT mirror `role`:
 * the client portal must never expose internal role codes (module doc
 * §"Portal team page"), so there is no legitimate reason for this app to
 * even read that field.
 */
const AdminUserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const AdminUser =
  mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema, "adminusers");
