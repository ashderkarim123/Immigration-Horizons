import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/deploy/check-env.js");
const require = createRequire(import.meta.url);
const { parseEnv, audit, failed } = require(SCRIPT) as {
  parseEnv: (text: string) => Record<string, string>;
  audit: (profile: "root" | "server", env: Record<string, string>) => { key: string; required: boolean; status: string; detail: string }[];
  failed: (rows: { required: boolean; status: string }[]) => unknown[];
};

const SECRET = "s3cr3t-value-that-must-never-be-printed";
const goodRoot = {
  NODE_ENV: "production",
  MONGODB_URI: `mongodb+srv://ih_app:${SECRET}@cluster0.example.mongodb.net/immigration-horizons`,
  SITE_URL: "https://app.immigrationhorizons.com",
  NEXT_PUBLIC_SITE_URL: "https://immigrationhorizons.com",
  PRIVATE_DOCUMENT_ROOT: "/srv/immigration-horizons/shared/private-documents",
  EMAIL_FROM: "Immigration Horizons <hello@immigrationhorizons.com>",
  CONTACT_RECEIVER_EMAIL: "intake@immigrationhorizons.com",
  RESEND_API_KEY: "re_abcdef123456",
  NEXT_PUBLIC_GTM_ID: "GTM-M9KC3GDW",
  NEXT_PUBLIC_GA_MEASUREMENT_ID: "off",
};
const goodServer = {
  ...goodRoot,
  SITE_URL: "https://admin.immigrationhorizons.com",
  SESSION_SECRET: "a-very-long-random-session-secret-0123456789abcdef",
  ADMIN_USERNAME: "breakglass",
  ADMIN_PASSWORD: "correct horse battery staple",
};
const status = (rows: ReturnType<typeof audit>, key: string) => rows.find((r) => r.key === key)?.status;

test("a correct production root environment passes", () => {
  assert.deepEqual(failed(audit("root", goodRoot)), []);
});

test("a correct production server environment passes", () => {
  assert.deepEqual(failed(audit("server", goodServer)), []);
});

test("SITE_URL must be the app host: it drives the CSRF Origin check for every portal and staff write", () => {
  for (const bad of ["http://localhost:3000", "https://immigrationhorizons.com", "https://app.immigrationhorizons.com/", ""]) {
    assert.notEqual(status(audit("root", { ...goodRoot, SITE_URL: bad }), "SITE_URL"), "SET", `SITE_URL=${bad}`);
  }
  assert.equal(status(audit("root", { ...goodRoot, NEXT_PUBLIC_SITE_URL: "https://app.immigrationhorizons.com" }), "NEXT_PUBLIC_SITE_URL"), "INVALID SHAPE");
});

test("missing and malformed keys are reported distinctly", () => {
  const { MONGODB_URI: _drop, ...withoutMongo } = goodRoot;
  assert.equal(status(audit("root", withoutMongo), "MONGODB_URI"), "MISSING");
  assert.equal(status(audit("root", { ...goodRoot, MONGODB_URI: "mongodb://<user>:<password>@host/db" }), "MONGODB_URI"), "INVALID SHAPE");
  assert.equal(status(audit("root", { ...goodRoot, NODE_ENV: "development" }), "NODE_ENV"), "INVALID SHAPE");
  assert.equal(status(audit("root", { ...goodRoot, PRIVATE_DOCUMENT_ROOT: "/srv/immigration-horizons/current/public/uploads" }), "PRIVATE_DOCUMENT_ROOT"), "INVALID SHAPE");
});

test("the server needs a strong session secret and a strong break-glass password", () => {
  assert.equal(status(audit("server", { ...goodServer, SESSION_SECRET: "short" }), "SESSION_SECRET"), "INVALID SHAPE");
  assert.equal(status(audit("server", { ...goodServer, SESSION_SECRET: "change-me-change-me-change-me-change-me" }), "SESSION_SECRET"), "INVALID SHAPE");
  assert.equal(status(audit("server", { ...goodServer, ADMIN_PASSWORD: "password" }), "ADMIN credential"), "INVALID SHAPE");
});

test("the admin credential mirrors the server boot guard: a bcrypt hash alone is enough", () => {
  const { ADMIN_PASSWORD: _drop, ...hashOnly } = goodServer;
  const hash = "$2b$12$" + "a".repeat(53);
  assert.deepEqual(failed(audit("server", { ...hashOnly, ADMIN_PASSWORD_HASH: hash })), []);
  assert.equal(status(audit("server", { ...hashOnly, ADMIN_PASSWORD_HASH: hash.slice(0, 40) }), "ADMIN credential"), "INVALID SHAPE");
  assert.equal(status(audit("server", hashOnly), "ADMIN credential"), "MISSING");
});

test("CONTACT_RECEIVER_EMAIL is required by the site but optional for the admin CMS", () => {
  const { CONTACT_RECEIVER_EMAIL: _drop, ...noContact } = goodServer;
  assert.deepEqual(failed(audit("server", noContact)), []);
  assert.equal(status(audit("root", noContact), "CONTACT_RECEIVER_EMAIL"), "MISSING");
});

test("mail needs one working transport; analytics ids are optional but must be well formed", () => {
  const { RESEND_API_KEY: _drop, ...noMail } = goodRoot;
  assert.equal(status(audit("root", noMail), "MAIL transport"), "MISSING");
  assert.equal(status(audit("root", { ...noMail, SMTP_HOST: "smtp.example.test" }), "MAIL transport"), "SET");
  assert.equal(status(audit("root", { ...goodRoot, RESEND_API_KEY: "not-a-resend-key" }), "MAIL transport"), "INVALID SHAPE");
  assert.deepEqual(failed(audit("root", { ...goodRoot, NEXT_PUBLIC_GTM_ID: "" })), [], "optional keys never fail the run");
  assert.equal(status(audit("root", { ...goodRoot, NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-1" }), "NEXT_PUBLIC_GA_MEASUREMENT_ID"), "INVALID SHAPE");
});

test("parseEnv handles quotes, comments and blank lines", () => {
  assert.deepEqual(parseEnv('# c\n\nA=1\nB="two words"\nC=\'x\'\nBAD LINE\nD=a=b\n'), { A: "1", B: "two words", C: "x", D: "a=b" });
});

test("the command line never prints a value and exits non-zero on a problem", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ih-env-"));
  const toFile = (name: string, env: Record<string, string>) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n"));
    return file;
  };
  const good = spawnSync("node", [SCRIPT, "both", toFile("root.env", goodRoot), toFile("server.env", goodServer)], { encoding: "utf8" });
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.match(good.stdout, /MATCH\s+PRIVATE_DOCUMENT_ROOT/);

  const bad = spawnSync("node", [SCRIPT, "root", toFile("bad.env", { ...goodRoot, SITE_URL: "http://localhost:3000", MONGODB_URI: `mongodb://<u>:${SECRET}@h/db` })], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  for (const output of [good.stdout + good.stderr, bad.stdout + bad.stderr]) {
    assert.equal(output.includes(SECRET), false, "a secret value was printed");
    assert.equal(output.includes("localhost:3000"), false, "a configured value was printed");
    assert.equal(output.includes("re_abcdef123456"), false);
  }
  assert.match(bad.stdout, /INVALID SHAPE\s+required\s+SITE_URL/);

  const mismatch = spawnSync("node", [SCRIPT, "both", toFile("r2.env", goodRoot), toFile("s2.env", { ...goodServer, PRIVATE_DOCUMENT_ROOT: "/srv/other" })], { encoding: "utf8" });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stdout, /MISMATCH/);
});
