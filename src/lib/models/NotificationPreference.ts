import "server-only";

import mongoose, { Schema } from "mongoose";

/** Mirrors server/models/admin/NotificationPreference.js — see ADR-006 §8. */
export const RECIPIENT_TYPES = ["employee", "client"] as const;
export const DIGEST_FREQUENCIES = ["daily", "weekly", "off"] as const;

export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

const NotificationPreferenceSchema = new Schema(
  {
    recipientType: { type: String, enum: RECIPIENT_TYPES, required: true },
    recipientAdmin: { type: Schema.Types.ObjectId, default: null },
    recipientClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },

    mentionEmails: { type: Boolean, default: true },
    digestEmails: { type: Boolean, default: true },
    digestFrequency: { type: String, enum: DIGEST_FREQUENCIES, default: "daily" },
  },
  { timestamps: true },
);

NotificationPreferenceSchema.pre("validate", function (this: mongoose.Document & Record<string, unknown>) {
  if (this.recipientType === "employee" && !this.recipientAdmin) {
    throw new Error('recipientType "employee" requires recipientAdmin.');
  }
  if (this.recipientType === "client" && !this.recipientClient) {
    throw new Error('recipientType "client" requires recipientClient.');
  }
});

NotificationPreferenceSchema.index(
  { recipientAdmin: 1 },
  { unique: true, partialFilterExpression: { recipientAdmin: { $type: "objectId" } } },
);
NotificationPreferenceSchema.index(
  { recipientClient: 1 },
  { unique: true, partialFilterExpression: { recipientClient: { $type: "objectId" } } },
);

export const NotificationPreference =
  mongoose.models.NotificationPreference ||
  mongoose.model("NotificationPreference", NotificationPreferenceSchema, "notification_preferences");
