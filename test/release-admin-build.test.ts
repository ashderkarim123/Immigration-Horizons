import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { verifyAdminBuild } = require(path.join(ROOT, "scripts/deploy/verify-admin-build.js")) as {
  verifyAdminBuild: (dir: string) => string[];
};

const INDEX = `<!doctype html><html><head>
<base href="/"><meta name="robots" content="noindex, nofollow">
<link rel="icon" href="favicon.ico"><link rel="stylesheet" href="styles-ABC123.css">
</head><body><iha-root></iha-root>
<script src="polyfills-ABC123.js" type="module"></script><script src="main-ABC123.js" type="module"></script>
</body></html>`;

/** A minimal but structurally real build; `override` lets one test break exactly one thing. */
function fixture(override: { index?: string; main?: string; drop?: string[] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih-admin-build-"));
  const files: Record<string, string> = {
    "index.html": override.index ?? INDEX,
    "main-ABC123.js": override.main ?? 'fetch("/api/v1/admin/session/bootstrap")',
    "polyfills-ABC123.js": "/* polyfills */",
    "styles-ABC123.css": "body{}",
    "favicon.ico": "ico",
  };
  for (const name of override.drop ?? []) delete files[name];
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test("a correct admin build is releasable", () => {
  assert.deepEqual(verifyAdminBuild(fixture()), []);
});

test("a screen that merely names a setting is not mistaken for a leaked secret", () => {
  const main = 'fetch("/api/v1/admin/x");const label="SESSION_SECRET and MONGODB_URI are set on the server";';
  assert.deepEqual(verifyAdminBuild(fixture({ main })), []);
});

test("the wrong base href, a second base, or a missing noindex is rejected", () => {
  assert.match(verifyAdminBuild(fixture({ index: INDEX.replace('href="/"', 'href="/admin-preview/"') })).join("|"), /expected "\/"/);
  assert.match(verifyAdminBuild(fixture({ index: INDEX.replace("<base", '<base href="/"><base') })).join("|"), /exactly one <base href>/);
  assert.match(verifyAdminBuild(fixture({ index: INDEX.replace(/<meta name="robots"[^>]*>/, "") })).join("|"), /noindex/);
});

test("a missing entry bundle, or an asset index.html points at that is absent, is rejected", () => {
  assert.match(verifyAdminBuild(fixture({ drop: ["polyfills-ABC123.js"] })).join("|"), /polyfills/);
  assert.match(verifyAdminBuild(fixture({ drop: ["favicon.ico"] })).join("|"), /missing file: favicon\.ico/);
  assert.match(verifyAdminBuild(fixture({ drop: ["styles-ABC123.css"] })).join("|"), /missing file: styles-ABC123\.css/);
});

test("a bundle that talks to a dev origin, or has no same-origin admin API path, is rejected", () => {
  assert.match(verifyAdminBuild(fixture({ main: 'fetch("http://localhost:4000/api/v1/admin/x")' })).join("|"), /forbidden origin/);
  assert.match(verifyAdminBuild(fixture({ main: 'fetch("/api/v1/staff/me")' })).join("|"), /same-origin \/api\/v1\/admin/);
});

test("secret-shaped values are rejected without being printed", () => {
  const uri = "mongodb+srv://ih_app:hunter2hunter2@cluster0.example.mongodb.net/db";
  const resend = "re_abcdefgh_" + "A1b2C3d4E5f6G7h8I9j0";
  for (const secret of [uri, resend, "-----BEGIN PRIVATE KEY-----"]) {
    const problems = verifyAdminBuild(fixture({ main: `fetch("/api/v1/admin/x");const k="${secret}";` }));
    assert.ok(problems.length > 0, `${secret.slice(0, 12)} should be rejected`);
    assert.equal(problems.join("|").includes("hunter2"), false, "a secret value was printed");
  }
});

test("the staff app copied into the admin tree is rejected", () => {
  const staffIndex = INDEX.replace('href="/"', 'href="/staff/"');
  assert.match(verifyAdminBuild(fixture({ index: staffIndex })).join("|"), /Staff app/);
  const dir = fixture();
  fs.mkdirSync(path.join(dir, "staff"));
  assert.match(verifyAdminBuild(dir).join("|"), /Staff app/);
});

test("deploy.sh packages both Angular apps into separate subdirectories and verifies both before activation", () => {
  const sh = fs.readFileSync(path.join(ROOT, "scripts/deploy/deploy.sh"), "utf8");
  const at = (needle: string) => {
    const i = sh.indexOf(needle);
    assert.ok(i >= 0, `deploy.sh is missing: ${needle}`);
    return i;
  };
  const activate = at('ln -sfn "$RELEASE" "$CURRENT"');
  const staffBuild = at("ng build case-management");
  const adminBuild = at("ng build admin-console");
  assert.ok(staffBuild < adminBuild && adminBuild < activate);
  assert.ok(at("verify-staff-build.js") < activate && at("verify-admin-build.js") < activate, "both bundles are verified before the symlink moves");
  at('ADMIN_STATIC="$RELEASE/static/admin-console"');
  at('STAFF_STATIC="$RELEASE/static/staff"');
  // static/ is wiped exactly once, before either copy, so adding the admin bundle cannot erase the staff one.
  assert.equal((sh.match(/rm -rf "\$RELEASE\/static"/g) ?? []).length, 1);
  assert.ok(at('rm -rf "$RELEASE/static"') < staffBuild + 400 && at('rm -rf "$RELEASE/static"') < adminBuild);
  // The toolchain is removed only after both outputs are copied.
  assert.ok(at('rm -rf "$RELEASE/enterprise-ui/node_modules"') > at("verify-admin-build.js"));
  assert.match(sh, /static\/admin-console\/index\.html" \]\] && echo/);
  assert.equal(/systemctl|nginx -s|sudo /.test(sh.replace(/^\s*#.*$/gm, "")), false, "deploy.sh never touches nginx");
});

test("the admin nginx snippet keeps Express paths ahead of the SPA, with no permanent redirect, CORS or add_header", () => {
  const raw = fs.readFileSync(path.join(ROOT, "scripts/deploy/nginx/snippets/ih-admin-routes.conf"), "utf8");
  const conf = raw.replace(/^\s*#.*$/gm, "");
  for (const prefix of ["/api/v1/", "/admin/", "/uploads/", "/css/", "/images/"]) {
    assert.ok(conf.includes(`location ^~ ${prefix}`), `${prefix} must be a ^~ prefix location so the asset regex cannot steal it`);
  }
  assert.match(conf, /location = \/admin \{/, "the bare /admin path stays on Express");
  assert.doesNotMatch(conf, /add_header/, "expires, not add_header, so the server-level security headers are inherited");
  assert.doesNotMatch(conf, /return\s+30[18]|permanent|Access-Control/i, "no permanent redirect that could outlive a rollback, and no CORS");
  assert.match(conf, /location \/ \{[^}]*try_files \$uri \/index\.html;[^}]*expires -1;/, "SPA fallback serves an uncached shell");
  assert.match(conf, /root \/srv\/immigration-horizons\/current\/static\/admin-console;/, "assets come from the ACTIVE release, so a symlink rollback rolls the UI back");
});

test("the Admin cutover runbook exists and states that nothing here changes nginx automatically", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs/deployment/ANGULAR_ADMIN_CUTOVER_RUNBOOK.md"), "utf8");
  for (const step of ["Step A", "Step B", "Step C", "Step D", "Step E"]) assert.ok(doc.includes(step), `${step} missing`);
  assert.match(doc, /never touches nginx/);
  assert.match(doc, /Do not serve it under a path/);
  assert.equal(/\bpassword\s*[:=]\s*\S{6,}|BEGIN [A-Z ]*PRIVATE KEY/i.test(doc), false, "no credentials in the runbook");
});
