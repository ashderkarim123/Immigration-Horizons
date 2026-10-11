/**
 * Shared fixtures for the Admin API integration suites: sentinel secrets planted in the environment BEFORE the app
 * loads, and a recursive scan that fails if any response ever carries one — or a credential field, a bcrypt hash or a
 * server filesystem path.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { seedAdminUser, loginAdminApi } = require('./auth');

const SECRETS = {
  ADMIN_PASSWORD: 'sentinel-admin-password-9f1',
  SESSION_SECRET: 'sentinel-session-secret-9f2',
  RESEND_API_KEY: 're_sentinel_resend_9f3',
  GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----sentinel9f4',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sentinel-sa-9f5@project.iam.gserviceaccount.com',
  GOOGLE_SHEET_ID: 'sentinel-sheet-9f6',
  USCIS_CASE_STATUS_CLIENT_SECRET: 'sentinel-uscis-secret-9f7',
  USCIS_CASE_STATUS_CLIENT_ID: 'sentinel-uscis-client-9f8',
  SMTP_PASS: 'sentinel-smtp-pass-9f9',
  PRIVATE_DOCUMENT_ROOT: path.join(require('node:os').tmpdir(), 'sentinel-private-docs-9fa'),
};

/** Call at the top of a test file, before requiring the app. */
function plantSecrets() {
  process.env.LOGIN_RATE_LIMIT = '1000';
  Object.assign(process.env, SECRETS);
  process.env.ADMIN_USERNAME = 'sentinel-breakglass';
}

const FORBIDDEN_KEY = /^(password|passwordHash|newPassword|tokenHash|sessionToken|sessionId|sid|secret|failedLoginCount|lockedUntil|filename|path|filePath|ip|userAgent)$/i;
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

/** Fails if `value` (any JSON shape) leaks a secret. `allow` names keys this response is expected to carry. */
function assertSafeDto(value, { allow = [] } = {}, trail = 'body') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertSafeDto(item, { allow }, `${trail}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(allow.includes(key) || !FORBIDDEN_KEY.test(key), `${trail}.${key} must not be exposed`);
      assertSafeDto(child, { allow }, `${trail}.${key}`);
    }
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  for (const [name, secret] of Object.entries(SECRETS)) assert.ok(!value.includes(secret), `${trail} leaks ${name}`);
  if (process.env.MONGODB_URI) assert.ok(!value.includes(process.env.MONGODB_URI), `${trail} leaks MONGODB_URI`);
  assert.doesNotMatch(value, /\$2[aby]\$\d{2}\$/, `${trail} carries a bcrypt hash`);
  assert.ok(!value.includes(SERVER_ROOT) && !value.includes(SERVER_ROOT.replace(/\\/g, '/')), `${trail} carries a server filesystem path`);
  return undefined;
}

/** A signed-in Admin API agent for a freshly seeded account of `role`. */
async function adminAgent(app, role, extra = {}) {
  const creds = await seedAdminUser({ role, ...extra });
  const agent = await loginAdminApi(request.agent(app), creds);
  return { agent, user: creds.user, creds };
}

const fieldErrorsOf = (res) => Object.fromEntries((res.body.error.fieldErrors || []).map((e) => [e.field, e.message]));

module.exports = { plantSecrets, assertSafeDto, adminAgent, fieldErrorsOf, SECRETS };
