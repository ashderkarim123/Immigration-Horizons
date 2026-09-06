/**
 * Seed a default staff user for dev testing:
 * email: admin@immigrationhorizons.com
 * password: Password123!
 * role: super_admin
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../config/db');
const AdminUser = require('../models/admin/User');

async function seedStaffUser() {
  await connectDB();

  const email = 'admin@immigrationhorizons.com';
  const existing = await AdminUser.findOne({ email });

  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash('Password123!', salt);

  if (existing) {
    existing.password = hashedPassword;
    existing.role = 'super_admin';
    existing.isActive = true;
    existing.mustChangePassword = false;
    existing.failedLoginCount = 0;
    existing.lockedUntil = null;
    await AdminUser.updateOne({ _id: existing._id }, { $set: {
      password: hashedPassword,
      role: 'super_admin',
      isActive: true,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null
    }});
    console.log(`Updated staff user: ${email} (Password: Password123!)`);
  } else {
    await AdminUser.create({
      name: 'Admin User',
      email,
      password: hashedPassword,
      role: 'super_admin',
      isActive: true,
      mustChangePassword: false,
      jobTitle: 'Super Administrator',
      department: 'Management'
    });
    console.log(`Created staff user: ${email} (Password: Password123!)`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

seedStaffUser().catch(err => {
  console.error('Failed to seed staff user:', err);
  process.exit(1);
});
