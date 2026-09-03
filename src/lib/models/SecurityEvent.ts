import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Append-only security/audit log, mirrored by server/models/SecurityEvent.js
 * (ADR-012 §1). Both applications write it: an operator investigating an
 * incident must not have to ask which application an attacker happened to
 * hit before they can find the record.
 *
 * Scope is deliberately narrow — this log answers "who authenticated, who
 * was refused, and what changed about an account". Case and document
 * history already have their own append-only logs (CaseActivity,
 * DocumentAccessLog) and are NOT duplicated here.
 *
 * The type list and enums are asserted against
 * docs/architecture/security-event-contract.json from both sides, so a
 * type added on one side and not the other fails tests on both.
 */
export const SECURITY_EVENT_TYPES = [
  "login_succeeded",
  "login_failed",
  "account_locked",
  "logout",
  "activation_completed",
  "password_reset_requested",
  "password_reset_completed",
  "password_changed",
  "session_revoked",
  "permission_denied",
  "csrf_rejected",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_EVENT_RESULTS = ["success", "failure", "denied"] as const;
export type SecurityEventResult = (typeof SECURITY_EVENT_RESULTS)[number];

/**
 * `anonymous` is not "unknown" — it means the request carried no valid
 * session at all, which is the normal state for a failed login. Keeping it
 * distinct from `system` stops a background job's events from being
 * confused with an unauthenticated caller's.
 */
export const SECURITY_EVENT_ACTOR_TYPES = [
  "client",
  "admin_user",
  "env_fallback",
  "anonymous",
  "system",
] as const;
export type SecurityEventActorType = (typeof SECURITY_EVENT_ACTOR_TYPES)[number];

/** Which of the three applications recorded the event. */
export const SECURITY_EVENT_SURFACES = ["portal", "staff", "admin_cms"] as const;
export type SecurityEventSurface = (typeof SECURITY_EVENT_SURFACES)[number];

const SecurityEventSchema = new Schema(
  {
    type: { type: String, enum: SECURITY_EVENT_TYPES, required: true },
    result: { type: String, enum: SECURITY_EVENT_RESULTS, required: true },
    surface: { type: String, enum: SECURITY_EVENT_SURFACES, required: true },

    actorType: { type: String, enum: SECURITY_EVENT_ACTOR_TYPES, required: true },
    actorClient: { type: Schema.Types.ObjectId, ref: "ClientUser", default: null },
    actorAdmin: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    actorName: { type: String, default: "" },

    /**
     * The account identifier the request was made against, normalised.
     *
     * Stored deliberately, including for failures against accounts that do
     * not exist: without it the log cannot answer "which account was being
     * attacked", which is the first question of any credential-stuffing
     * investigation. It is an identifier, never a credential — see
     * `assertNoSecrets` in ../security/security-events.ts for what may
     * never be stored, and docs/security/DATA_RETENTION.md for how long
     * this is kept.
     */
    subjectEmail: { type: String, default: "", lowercase: true, trim: true },

    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    /** Structured detail — never a credential, token, or document content. */
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SecurityEventSchema.index({ createdAt: -1 });
SecurityEventSchema.index({ type: 1, createdAt: -1 });
SecurityEventSchema.index({ subjectEmail: 1, createdAt: -1 });
SecurityEventSchema.index({ actorClient: 1, createdAt: -1 });
SecurityEventSchema.index({ actorAdmin: 1, createdAt: -1 });
SecurityEventSchema.index({ ip: 1, createdAt: -1 });

/**
 * Append-only, enforced rather than merely documented. Mongoose cannot stop
 * a raw driver call, so this is a guard against application code drifting
 * into "just fix up that one row", not a database-level permission — the
 * deployment guide covers restricting the application's Mongo role.
 */
const APPEND_ONLY_MESSAGE =
  "security_events is append-only: entries cannot be modified or deleted through the application.";

for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"] as const) {
  SecurityEventSchema.pre(op, function () {
    throw new Error(APPEND_ONLY_MESSAGE);
  });
}
for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"] as const) {
  SecurityEventSchema.pre(op, function () {
    throw new Error(APPEND_ONLY_MESSAGE);
  });
}
SecurityEventSchema.pre("save", function () {
  if (!this.isNew) throw new Error(APPEND_ONLY_MESSAGE);
});

export const SecurityEvent =
  mongoose.models.SecurityEvent ||
  mongoose.model("SecurityEvent", SecurityEventSchema, "security_events");
