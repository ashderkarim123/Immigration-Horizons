import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

/**
 * Release Gate 01 (ADR-024): static checks on the deployment assets. No nginx
 * daemon, no root, no network and no Angular build — these catch the
 * regressions that would otherwise only show up on the production server:
 * a wrong base href, a deploy script that stops building the staff app, an
 * nginx route that strips `/api/v1` or hides a missing bundle behind the SPA
 * fallback. The Angular build itself is verified by the Enterprise UI CI job
 * (scripts/deploy/verify-staff-build.js, covered here against fixtures).
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");
const require = createRequire(import.meta.url);

/** Whole-line and trailing comments removed, so assertions about commands cannot be satisfied by prose. */
const code = (source: string) =>
  source
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+#\s.*$/, ""))
    .join("\n");

const snippet = read("scripts/deploy/nginx/snippets/ih-app-staff-routes.conf");
const template = read("scripts/deploy/nginx/app.immigrationhorizons.com.conf");
const legacy = read("scripts/deploy/nginx/rollback/app.immigrationhorizons.com.next-only.conf");
const deploy = read("scripts/deploy/deploy.sh");

// ---------------------------------------------------------------------------
// Angular production base href
// ---------------------------------------------------------------------------

test("the case-management production build is rooted at /staff/ and development stays at /", () => {
  const angular = JSON.parse(read("enterprise-ui/angular.json"));
  const build = angular.projects["case-management"].architect.build;
  assert.equal(build.configurations.production.baseHref, "/staff/");
  assert.equal(build.defaultConfiguration, "production", "a plain `ng build` is the production build CI and deploy.sh run");
  assert.equal(build.configurations.development.baseHref, undefined, "local development keeps root-based URLs");
  assert.equal(build.options.baseHref, undefined);
  assert.equal(angular.projects["admin-console"].architect.build.configurations.production.baseHref, undefined, "admin-console is not cut over");
});

test("the Angular API client is same-origin: relative /api/v1, credentials, no CORS, no absolute API URL", () => {
  const apiService = read("enterprise-ui/projects/case-management/src/app/core/api/api.service.ts");
  const interceptor = read("enterprise-ui/projects/case-management/src/app/core/interceptors/api.interceptor.ts");
  assert.match(apiService, /basePath = '\/api\/v1'/);
  assert.doesNotMatch(apiService, /https?:\/\//, "no absolute API origin in the API service");
  assert.match(interceptor, /req\.url\.startsWith\('\/api\/v1'\)/);
  assert.match(interceptor, /withCredentials:\s*true/);
  assert.doesNotMatch(interceptor, /Authorization|Bearer/i, "no browser bearer token");

  const srcDir = path.join(ROOT, "enterprise-ui/projects/case-management/src/app");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith(".spec.ts")) {
        const text = fs.readFileSync(full, "utf8");
        if (/apiBaseUrl|localhost|127\.0\.0\.1|:4000/.test(text)) offenders.push(path.relative(ROOT, full));
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, [], "no production code may reference a dev API origin");
});

// ---------------------------------------------------------------------------
// nginx
// ---------------------------------------------------------------------------

const balanced = (text: string) => (text.match(/{/g) ?? []).length === (text.match(/}/g) ?? []).length;

test("nginx files are structurally sound: balanced braces, every directive terminated, includes resolvable", () => {
  for (const [name, text] of Object.entries({ snippet, template, legacy })) {
    assert.ok(balanced(text), `${name}: unbalanced braces`);
    for (const line of code(text).split("\n")) {
      const t = line.trim();
      if (!t || t.endsWith("{") || t === "}" || t.endsWith(";")) continue;
      assert.fail(`${name}: directive without a terminating semicolon: "${t}"`);
    }
  }
  for (const [, file] of code(template).matchAll(/include\s+\/etc\/nginx\/snippets\/([^;\s]+);/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, "scripts/deploy/nginx/snippets", file)), `template includes a snippet that is not in the repo: ${file}`);
  }
});

test("/api/v1 goes to Express with the path intact and the real app host preserved", () => {
  const block = snippet.match(/location\s+\^~\s+\/api\/v1\/\s*{([\s\S]*?)\n}/)?.[1] ?? "";
  assert.ok(block, "a ^~ /api/v1/ location exists (^~ so no regex location can steal it)");
  assert.match(block, /proxy_pass\s+http:\/\/127\.0\.0\.1:4000;/, "no URI part after the port: /api/v1 is not stripped");
  assert.doesNotMatch(block, /proxy_pass\s+http:\/\/127\.0\.0\.1:4000\//, "a trailing slash would rewrite the path");
  assert.match(block, /proxy_set_header\s+Host\s+\$host;/);
  assert.match(block, /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/);
  assert.match(block, /proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/);
  assert.match(block, /proxy_set_header\s+X-Real-IP\s+\$remote_addr;/);
});

test("/staff is served from the ACTIVE release; a missing asset is a 404, unknown routes get the shell", () => {
  const roots = [...snippet.matchAll(/root\s+([^;]+);/g)].map((m) => m[1]);
  assert.ok(roots.length >= 3);
  for (const r of roots) assert.equal(r, "/srv/immigration-horizons/current/static", "every static location serves the active release");

  assert.match(snippet, /location\s+=\s+\/staff\s*{[\s\S]*?try_files\s+\/staff\/index\.html\s+=404;/, "exact /staff serves the shell without a redirect");
  const assets = snippet.match(/location\s+~\s+\^\/staff\/\.\+\\\.\(\?:([^)]+)\)\$\s*{([\s\S]*?)\n}/);
  assert.ok(assets, "an asset-extension location exists");
  assert.match(assets![2], /try_files\s+\$uri\s+=404;/, "a missing bundle must NOT fall back to index.html");
  const extensions = new RegExp(`^(?:${assets![1]})$`);
  for (const ext of ["js", "css", "map", "ico", "woff", "woff2", "svg"]) assert.ok(extensions.test(ext), `asset extension ${ext} is covered`);
  assert.match(snippet, /location\s+\/staff\/\s*{[\s\S]*?try_files\s+\$uri\s+\/staff\/index\.html;/, "deep links fall back to the shell");
  assert.match(snippet, /location\s+\/staff\/\s*{[\s\S]*?expires\s+-1;/, "the shell is never cached");
  assert.match(assets![2], /expires\s+1y;/);
});

test("the snippet never redirects permanently, never sets add_header, and never opens CORS", () => {
  const body = code(snippet);
  assert.doesNotMatch(body, /\breturn\s+30[18]\b|rewrite\s+[^;]+permanent/, "a cached permanent redirect would loop after a rollback");
  assert.doesNotMatch(body, /add_header/, "add_header in a location would drop the inherited security headers; use expires");
  assert.doesNotMatch(code(template) + body, /Access-Control-|\bcors\b/i, "same-origin: no CORS");
});

test("the app-host template keeps Next.js as the default and does not route the portal anywhere else", () => {
  const body = code(template);
  assert.match(body, /server_name\s+app\.immigrationhorizons\.com;/);
  assert.match(body, /include\s+\/etc\/nginx\/snippets\/ih-app-staff-routes\.conf;/);
  const fallback = body.match(/location\s+\/\s*{([\s\S]*?)\n    }/)?.[1] ?? "";
  assert.match(fallback, /proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/);
  assert.match(fallback, /proxy_set_header\s+Host\s+\$host;/, "the host header is load-bearing for the host split in proxy.ts");
  assert.doesNotMatch(body, /location[^{]*\/portal/, "portal routes are not special-cased: they fall through to Next");
  assert.doesNotMatch(body, /location[^{]*\/api\/portal/);
  assert.match(body, /client_max_body_size\s+25M;/, "document upload size preserved");
  for (const header of ["X-Robots-Tag", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"]) assert.ok(body.includes(header), `${header} preserved`);
});

test("the rollback reference is the previous Next-only routing", () => {
  const body = code(legacy);
  assert.match(body, /proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/);
  assert.doesNotMatch(body, /\/api\/v1|\/staff|include\s/, "no Angular routing, no includes");
  assert.equal((body.match(/location\s/g) ?? []).length, 1, "a single catch-all location");
});

// ---------------------------------------------------------------------------
// deploy.sh
// ---------------------------------------------------------------------------

test("deploy.sh builds, copies and verifies the Angular staff app BEFORE activating the release", () => {
  const body = code(deploy);
  const at = (needle: string) => {
    const index = body.indexOf(needle);
    assert.ok(index >= 0, `deploy.sh is missing: ${needle}`);
    return index;
  };
  const install = at('cd "$RELEASE/enterprise-ui" && npm ci --no-audit --no-fund --include=dev');
  const build = at("ng build case-management");
  const copy = at('cp -R "$STAFF_DIST/." "$STAFF_STATIC/"');
  const verify = at("verify-staff-build.js");
  const activate = at('ln -sfn "$RELEASE" "$CURRENT"');
  assert.ok(install < build && build < copy && copy < verify && verify < activate, "install → build → copy → verify → activate");
  assert.match(body, /STAFF_STATIC="\$RELEASE\/static\/staff"/, "assets live INSIDE the release, so a symlink rollback rolls the UI back");
  assert.match(body, /\[\[ -f "\$STAFF_STATIC\/index\.html" \]\] \|\| die/, "a missing index fails the deploy");
  assert.doesNotMatch(body, /npm install\b/, "reproducible installs only");
  assert.doesNotMatch(body, /ng build admin-console/, "admin-console is not built or served in this release");
});

test("deploy.sh health check covers the canonical API and the staff files, and never touches nginx", () => {
  const body = code(deploy);
  assert.match(body, /check "http:\/\/127\.0\.0\.1:4000\/api\/v1\/health"/);
  assert.match(body, /\[\[ -f "\$CURRENT\/static\/staff\/index\.html" \]\]/);
  assert.match(body, /check "http:\/\/127\.0\.0\.1:3000\/"/, "existing checks are kept");
  assert.match(body, /check "http:\/\/127\.0\.0\.1:4000\/admin\/login"/);
  assert.match(body, /node --check server\.js && node --check app\.js/, "admin entrypoint syntax check kept");
  assert.doesNotMatch(body, /(?:^|[;&|]\s*)(?:sudo|nginx|systemctl)\b/m, "Step B is a deliberate operator action, never part of the app deploy");
});

test("deploy.sh is syntactically valid bash", (t) => {
  const probe = spawnSync("bash", ["--version"]);
  if (probe.status !== 0) return t.skip("bash is not available");
  const result = spawnSync("bash", ["-n", path.join(ROOT, "scripts/deploy/deploy.sh")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the deploy workflow's mandatory smoke checks do not require the Step B routes", () => {
  const workflow = read(".github/workflows/deploy.yml");
  // The mandatory step ends at the first blank line; the informational step after it may mention /staff.
  const mandatory = workflow.split("name: Confirm the site is answering")[1]?.split(/\r?\n\s*\r?\n/)[0] ?? "";
  assert.match(mandatory, /https:\/\/immigrationhorizons\.com/);
  assert.match(mandatory, /app\.immigrationhorizons\.com\/portal\/login/);
  assert.match(mandatory, /admin\.immigrationhorizons\.com\/admin\/login/);
  assert.doesNotMatch(mandatory, /\/staff\/login|\/api\/v1\/health/, "code may deploy before nginx Step B; the Angular smoke is informational");
});

// ---------------------------------------------------------------------------
// verify-staff-build.js
// ---------------------------------------------------------------------------

const { verifyStaffBuild } = require(path.join(ROOT, "scripts/deploy/verify-staff-build.js")) as { verifyStaffBuild: (dir: string) => string[] };

function fixture(overrides: { base?: string; skip?: string[]; extra?: Record<string, string> } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih-staff-build-"));
  const files: Record<string, string> = {
    "index.html": `<!doctype html><html><head><base href="${overrides.base ?? "/staff/"}"><link rel="icon" href="favicon.ico"></head><body><ih-root></ih-root><script src="polyfills-ABC.js" type="module"></script><script src="main-XYZ.js" type="module"></script></body></html>`,
    "favicon.ico": "",
    "polyfills-ABC.js": "console.log('p')",
    "main-XYZ.js": "fetch('/api/v1/health')",
    ...overrides.extra,
  };
  for (const [name, body] of Object.entries(files)) if (!overrides.skip?.includes(name)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test("verify-staff-build accepts a correct /staff/ build", () => {
  assert.deepEqual(verifyStaffBuild(fixture()), []);
});

test("verify-staff-build rejects a wrong base href, a missing entry file and missing bundles", () => {
  assert.match(verifyStaffBuild(fixture({ base: "/" })).join("|"), /expected "\/staff\/"/);
  assert.match(verifyStaffBuild(fixture({ skip: ["index.html"] })).join("|"), /index\.html is missing/);
  assert.match(verifyStaffBuild(fixture({ skip: ["main-XYZ.js"] })).join("|"), /main-\*\.js|missing file/);
  assert.match(verifyStaffBuild(fixture({ skip: ["polyfills-ABC.js"] })).join("|"), /polyfills/);
});

test("verify-staff-build rejects a bundle that talks to another origin and an index that references a missing file", () => {
  for (const bad of ["fetch('http://localhost:4000/api/v1/x')", "const u='http://127.0.0.1:4000'", "fetch('https://admin.immigrationhorizons.com/api/v1/x')"]) {
    assert.match(verifyStaffBuild(fixture({ extra: { "main-XYZ.js": `${bad};/api/v1` } })).join("|"), /forbidden origin pattern/, bad);
  }
  assert.match(verifyStaffBuild(fixture({ extra: { "main-XYZ.js": "console.log(1)" } })).join("|"), /\/api\/v1/);
  assert.match(verifyStaffBuild(fixture({ skip: ["favicon.ico"] })).join("|"), /missing file: favicon\.ico/);
});
