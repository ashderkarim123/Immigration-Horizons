const mongoose = require('mongoose');

/**
 * Mirrors src/lib/models/ClientUser.ts — same field names, same enum, same
 * collection ('clientusers', Mongoose's default pluralization of
 * 'ClientUser', confirmed to match and pinned explicitly here so it can
 * never silently drift if either app's Mongoose version diverges later).
 * See docs/architecture/ADR-002-case-workspace-domain.md.
 *
 * Express only ever *reads* this collection (case conversion needs to know
 * a client's id and activation status) — client accounts themselves are
 * created and authenticated entirely by the Next.js app. Keep this file in
 * sync if the Next.js model changes; server/test/case-schema-contract.test.js
 * checks the fields both apps actually rely on.
 */
const CLIENT_USER_STATUS_VALUES = ['pending', 'active', 'locked', 'disabled'];

const ClientUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true },
    normalizedEmail: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: '' },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    status: { type: String, enum: CLIENT_USER_STATUS_VALUES, default: 'pending' },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    acceptedTermsAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ClientUserSchema.statics.STATUS_VALUES = CLIENT_USER_STATUS_VALUES;

// Mirrors src/lib/models/ClientUser.ts's indexes exactly — declaring them
// here too is defense-in-depth documentation, not a second provisioning
// path: createIndexes() is additive/idempotent, so running it from this
// app's script when the Next.js app already created these is a safe no-op.
ClientUserSchema.index({ normalizedEmail: 1 }, { unique: true });
ClientUserSchema.index({ status: 1 });
ClientUserSchema.index({ lastLoginAt: 1 });

module.exports = mongoose.model('ClientUser', ClientUserSchema, 'clientusers');
