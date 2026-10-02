#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS on purpose: runs on the server with bare `node`, no loader or build step */
/**
 * Verifies an Angular case-management production build is safe to serve from
 * https://app.immigrationhorizons.com/staff/ (Release Gate 01, ADR-024 §10).
 *
 *   node scripts/deploy/verify-staff-build.js enterprise-ui/dist/case-management/browser
 *   node scripts/deploy/verify-staff-build.js "$RELEASE/static/staff"
 *
 * No dependencies, no network, no nginx. Run in CI after `ng build` and by
 * deploy.sh on the copied release directory, so a wrong base href, a missing
 * entry file or a bundle that talks to the wrong origin fails BEFORE the
 * release symlink moves. Prints findings only — never file contents.
 */
const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_BASE_HREF = '/staff/';
// Anything in the bundle that would send the browser off the app origin: a dev
// API URL, a loopback address, or the admin host (which would also need CORS).
const FORBIDDEN_IN_BUNDLES = [/localhost/i, /127\.0\.0\.1/, /:4000\b/, /admin\.immigrationhorizons\.com/i];

/** Returns a list of problems; empty means the build is releasable. */
function verifyStaffBuild(dir) {
  const problems = [];
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) return [`index.html is missing from ${dir}`];

  const html = fs.readFileSync(indexPath, 'utf8');
  const bases = [...html.matchAll(/<base\s+href=["']([^"']*)["']\s*\/?>/gi)].map((m) => m[1]);
  if (bases.length !== 1) problems.push(`expected exactly one <base href>, found ${bases.length}`);
  else if (bases[0] !== EXPECTED_BASE_HREF) problems.push(`<base href> is "${bases[0]}", expected "${EXPECTED_BASE_HREF}"`);

  const files = fs.readdirSync(dir);
  if (!files.some((f) => /^main-.+\.js$/.test(f))) problems.push('no hashed main-*.js bundle');
  if (!files.some((f) => /^polyfills-.+\.js$/.test(f))) problems.push('no hashed polyfills-*.js bundle');

  // Every local asset index.html references must exist, or the app is a blank page in production.
  for (const [, ref] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (/^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('#') || ref === EXPECTED_BASE_HREF) continue;
    const local = ref.replace(/^\/staff\//, '').split('?')[0];
    if (local && !fs.existsSync(path.join(dir, local))) problems.push(`index.html references a missing file: ${ref}`);
  }

  let apiPathSeen = false;
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const pattern of FORBIDDEN_IN_BUNDLES) {
      if (pattern.test(code)) problems.push(`${file} contains a forbidden origin pattern ${pattern}`);
    }
    if (code.includes('/api/v1')) apiPathSeen = true;
  }
  if (!apiPathSeen) problems.push('no bundle contains the relative /api/v1 API path');

  return problems;
}

module.exports = { verifyStaffBuild, EXPECTED_BASE_HREF };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: verify-staff-build.js <directory containing index.html>');
    process.exit(2);
  }
  const problems = verifyStaffBuild(path.resolve(dir));
  if (problems.length) {
    console.error(`Angular staff build is NOT releasable (${dir}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Angular staff build OK (${dir}): base href ${EXPECTED_BASE_HREF}, entry bundles present, relative /api/v1 only.`);
}
