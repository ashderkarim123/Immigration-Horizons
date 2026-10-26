#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS on purpose: runs on the server with bare `node`, no loader or build step */
/**
 * Verifies an Angular admin-console production build is safe to serve from the
 * root of its own host (Phase 15, ADR-031 Gate B).
 *
 *   node scripts/deploy/verify-admin-build.js enterprise-ui/dist/admin-console/browser
 *   node scripts/deploy/verify-admin-build.js "$RELEASE/static/admin-console"
 *
 * Sibling of verify-staff-build.js: no dependencies, no network, and it prints
 * findings only, never file contents. It scans distribution files only (never
 * source maps or docs) and matches the SHAPE of a secret, not a variable name,
 * so a screen that merely names a setting cannot fail a release.
 */
const fs = require('node:fs');
const path = require('node:path');

// The Admin SPA owns the host root, so its router and assets resolve from "/".
const EXPECTED_BASE_HREF = '/';
const ADMIN_API_PATH = '/api/v1/admin';

// Anything that would send the browser off its own origin: a dev API URL or a loopback address.
const FORBIDDEN_ORIGINS = [/localhost/i, /127\.0\.0\.1/, /:4000\b/];

// Secret-shaped values. Each one needs the structure of a real credential.
const SECRET_SHAPES = [
  [/mongodb(?:\+srv)?:\/\/[^\s"'`/@]+:[^\s"'`/@]+@/i, 'a MongoDB connection string with credentials'],
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/, 'a Resend API key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'a PEM private key'],
  [/"private_key_id"\s*:/, 'a Google service-account key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
];

const isLocalRef = (ref) => !(/^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:'));

/** Returns a list of problems; empty means the build is releasable. */
function verifyAdminBuild(dir) {
  const problems = [];
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) return [`index.html is missing from ${dir}`];

  const html = fs.readFileSync(indexPath, 'utf8');
  const bases = [...html.matchAll(/<base\s+href=["']([^"']*)["']\s*\/?>/gi)].map((m) => m[1]);
  if (bases.length !== 1) problems.push(`expected exactly one <base href>, found ${bases.length}`);
  else if (bases[0] !== EXPECTED_BASE_HREF) problems.push(`<base href> is "${bases[0]}", expected "${EXPECTED_BASE_HREF}"`);

  // The Staff app lives under /staff/ and must never be copied into this tree.
  if (/<base\s+href=["']\/staff\//i.test(html) || fs.existsSync(path.join(dir, 'staff'))) {
    problems.push('the Staff app appears to have been copied into the Admin tree');
  }
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) problems.push('index.html does not carry a noindex robots meta');

  const files = fs.readdirSync(dir);
  if (!files.some((f) => /^main-.+\.js$/.test(f))) problems.push('no hashed main-*.js bundle');
  if (!files.some((f) => /^polyfills-.+\.js$/.test(f))) problems.push('no hashed polyfills-*.js bundle');

  // Every local asset index.html references must exist (this covers the favicon too), or the app is blank in production.
  for (const [, ref] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (!isLocalRef(ref) || ref === EXPECTED_BASE_HREF) continue;
    const local = ref.replace(/^\//, '').split('?')[0];
    if (local && !fs.existsSync(path.join(dir, local))) problems.push(`index.html references a missing file: ${ref}`);
  }

  let adminApiSeen = false;
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const pattern of FORBIDDEN_ORIGINS) {
      if (pattern.test(code)) problems.push(`${file} contains a forbidden origin pattern ${pattern}`);
    }
    for (const [pattern, what] of SECRET_SHAPES) {
      if (pattern.test(code)) problems.push(`${file} contains ${what}`);
    }
    if (code.includes(ADMIN_API_PATH)) adminApiSeen = true;
  }
  if (!adminApiSeen) problems.push(`no bundle contains the same-origin ${ADMIN_API_PATH} API path`);

  return problems;
}

module.exports = { verifyAdminBuild, EXPECTED_BASE_HREF, ADMIN_API_PATH };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: verify-admin-build.js <directory containing index.html>');
    process.exit(2);
  }
  const problems = verifyAdminBuild(path.resolve(dir));
  if (problems.length) {
    console.error(`Angular admin build is NOT releasable (${dir}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Angular admin build OK (${dir}): base href ${EXPECTED_BASE_HREF}, entry bundles present, same-origin ${ADMIN_API_PATH} only.`);
}
