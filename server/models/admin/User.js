const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: [
        // Original roles — kept for back-compat with existing accounts.
        'super_admin', 'admin', 'editor',
        // Lead-operations roles (Phase 9).
        'pm', 'petition_writer', 'business_plan_specialist',
        'recommendation_letter_specialist', 'uscis_forms_specialist',
        'evidence_collector', 'reviewer', 'viewer',
      ],
      default: 'editor',
    },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true },

    // Credential lifecycle fields (ADR-016)
    mustChangePassword: { type: Boolean, default: false },
    credentialIssuedAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    jobTitle: { type: String, default: '' },
    department: { type: String, default: '' },

    // Login lockout counters (ADR-012 3). Written by BOTH this app and the
    // SaaS staff app, which authenticate the same records — see
    // utils/lockout.js for why enforcement in only one of them is worthless.
    lastLoginAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongoose 7+ dropped callback-style middleware — a hook must be a plain
// async function with no `next` parameter/call. (Pre-existing bug: this was
// written in the old callback style and had never actually been exercised,
// since every login in this app to date used the env-credential fallback
// rather than a real DB user.)
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('AdminUser', UserSchema);
