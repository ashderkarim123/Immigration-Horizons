/**
 * Create or recover a staff account (break-glass when the last Super Admin
 * password is lost).
 *
 *   SEED_EMAIL=info@immigrationhorizons.com SEED_PASSWORD='...' \
 *   SEED_NAME='Immigration Horizons Admin' node scripts/seedStaffUser.js
 *
 * Nothing secret lives in this file: the credential comes from the environment
 * of whoever runs it, so it never lands in git or shell history files you commit.
 *
 * - Default role is super_admin (override with SEED_ROLE).
 * - If the account exists it is recovered: new password, reactivated, lockout
 *   cleared, and every staff session revoked.
 * - A password shorter than the staff minimum (12) is accepted so you can sign
 *   in, but the account is then forced to choose a compliant one at first login.
 *   SEED_MUST_CHANGE=true forces that for any password.
 */
const MIN_STAFF_PASSWORD_LENGTH = 12;

async function upsertStaffUser({ email, password, name, role = 'super_admin', mustChangePassword = false }) {
  const AdminUser = require('../models/admin/User');
  const EmployeeSession = require('../models/EmployeeSession');

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('SEED_EMAIL must be a valid email address.');
  if (!password || password.length < 8) throw new Error('SEED_PASSWORD must be at least 8 characters.');
  if (!AdminUser.schema.path('role').enumValues.includes(role)) throw new Error(`Unknown role "${role}".`);

  // Too short for the staff policy: let them in once, then force a compliant password.
  const forceChange = mustChangePassword || password.length < MIN_STAFF_PASSWORD_LENGTH;

  let user = await AdminUser.findOne({ email: normalizedEmail });
  const created = !user;

  if (created) {
    // The pre-save hook hashes `password`; never pre-hash here or it is hashed twice.
    user = await AdminUser.create({
      name: name || 'Administrator',
      email: normalizedEmail,
      password,
      role,
      isActive: true,
      mustChangePassword: forceChange,
      credentialIssuedAt: new Date(),
      jobTitle: role === 'super_admin' ? 'Super Administrator' : '',
    });
  } else {
    user.password = password; // hashed by the hook on save
    user.role = role;
    user.isActive = true;
    user.mustChangePassword = forceChange;
    user.credentialIssuedAt = new Date();
    user.passwordChangedAt = null;
    if (name) user.name = name;
    await user.save();
    await EmployeeSession.deleteMany({ adminUser: user._id });
  }

  // Lockout counters are written with updateOne, never save(), per ADR-012 §3.
  await AdminUser.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockedUntil: null } });

  return { created, id: String(user._id), email: normalizedEmail, role, mustChangePassword: forceChange };
}

async function main() {
  require('dotenv').config();
  const mongoose = require('mongoose');
  const connectDB = require('../config/db');

  const mustChange = String(process.env.SEED_MUST_CHANGE || '').toLowerCase() === 'true';
  await connectDB();
  try {
    const result = await upsertStaffUser({
      email: process.env.SEED_EMAIL,
      password: process.env.SEED_PASSWORD,
      name: process.env.SEED_NAME,
      role: process.env.SEED_ROLE || 'super_admin',
      mustChangePassword: mustChange,
    });
    console.log(`${result.created ? 'Created' : 'Recovered'} ${result.role}: ${result.email}`);
    if (result.mustChangePassword) {
      console.log(`You will be asked to choose a new password (${MIN_STAFF_PASSWORD_LENGTH}+ characters) at first sign-in.`);
    }
  } finally {
    await mongoose.connection.close();
  }
}

module.exports = { upsertStaffUser, MIN_STAFF_PASSWORD_LENGTH };

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('Failed to seed staff user:', err.message);
    process.exit(1);
  });
}
