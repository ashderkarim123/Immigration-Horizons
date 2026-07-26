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
