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
 * Scrapes the CSRF token out of a rendered admin page (ADR-012 §5). Every
 * POST form now carries it as a hidden input, so any authenticated page
 * will do; `/admin/login` serves the pre-login token.
 */
async function readCsrfToken(agent, path) {
  const res = await agent.get(path);
  const match = /name="_csrf" value="([^"]*)"/.exec(res.text || '');
  if (!match) {
    throw new Error(`[test auth] No CSRF token found on ${path} (status ${res.status}).`);
  }
  return match[1];
}

/**
 * Makes every subsequent mutating call on this agent carry the session's
 * CSRF token, as the `x-csrf-token` header.
 *
 * The header is a legitimate submission channel, not a test-only bypass: a
 * cross-site HTML form cannot set custom headers at all, and a cross-origin
 * XHR that tries triggers a CORS preflight the admin never answers. Using
 * it here keeps the ~110 existing `agent.post(...)` call sites unchanged
 * while still exercising the real middleware — a test that wants to prove
 * the middleware rejects a tokenless request simply uses a bare supertest
 * agent instead of a decorated one (see test/csrf.test.js).
 */
function attachCsrf(agent, token) {
  ['post', 'put', 'patch', 'delete'].forEach((method) => {
    const original = agent[method].bind(agent);
    agent[method] = (url) => original(url).set('x-csrf-token', token);
  });
  agent.csrfToken = token;
  return agent;
}

/**
 * Logs an existing supertest agent in through the real POST /admin/login
 * route (not a middleware bypass), so the persisted session cookie on the
 * agent reflects an actual authenticated login. Returns the same agent for
 * chaining/reuse across subsequent requests.
 *
 * Two tokens are involved, deliberately: one to submit the login form, and
 * a second read afterwards because a successful login regenerates the
 * session (fixation protection) and therefore issues a fresh token.
 */
async function loginAs(agent, { email, password }) {
  const loginToken = await readCsrfToken(agent, '/admin/login');

  const res = await agent
    .post('/admin/login')
    .type('form')
    .send({ username: email, password, _csrf: loginToken });

  if (res.status !== 302) {
    throw new Error(`[test auth] Login failed for ${email} (status ${res.status} — the login route only redirects on success).`);
  }

  return attachCsrf(agent, await readCsrfToken(agent, '/admin'));
}

module.exports = { seedAdminUser, loginAs, uniqueEmail, readCsrfToken, attachCsrf };
