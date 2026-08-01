const AdminUser = require('../../models/admin/User');

let counter = 0;
/** Unique-enough email per call so parallel/sequential seeds never collide on the unique index. */
function uniqueEmail(role) {
  counter += 1;
  return `${role}-${Date.now()}-${counter}@test.immigrationhorizons.invalid`;
}

/**
 * Seeds a real AdminUser document. Password hashing goes through the model's
 * own `pre('save')` bcrypt hook — the same code path a real signup/seed
 * script uses — so login tests exercise real password verification, not a
 * shortcut.
 */
async function seedAdminUser({ name, role, email, password = 'Test-Password-123!', isActive = true }) {
  const resolvedEmail = email || uniqueEmail(role);
  const user = await AdminUser.create({
    name: name || `Test ${role}`,
    email: resolvedEmail,
    password,
    role,
    isActive,
  });
  return { user, email: resolvedEmail, password };
}

/**
 * Logs an existing supertest agent in through the real POST /admin/login
 * route (not a middleware bypass), so the persisted session cookie on the
 * agent reflects an actual authenticated login. Returns the same agent for
 * chaining/reuse across subsequent requests.
 */
async function loginAs(agent, { email, password }) {
  const res = await agent.post('/admin/login').type('form').send({ username: email, password });
  if (res.status !== 302) {
    throw new Error(`[test auth] Login failed for ${email} (status ${res.status} — the login route only redirects on success).`);
  }
  return agent;
}

module.exports = { seedAdminUser, loginAs, uniqueEmail };
