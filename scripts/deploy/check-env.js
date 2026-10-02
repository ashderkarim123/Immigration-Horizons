#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS on purpose: runs on the server with bare `node`, no loader or build step */
/**
 * Release environment audit (Release Gate 01, ADR-024 §21). Reports ONLY a
 * status per key — SET, MISSING or INVALID SHAPE — and never a value, so the
 * output is safe to paste into a ticket or a CI log.
 *
 *   node scripts/deploy/check-env.js root   /srv/immigration-horizons/shared/root.env
 *   node scripts/deploy/check-env.js server /srv/immigration-horizons/shared/server.env
 *   node scripts/deploy/check-env.js both   <root.env> <server.env>     # also cross-checks the shared document root
 *
 * Exit code 1 when any REQUIRED key is missing or invalid. Optional keys never fail the run.
 * No dependencies; nothing is read from the environment of the shell itself.
 */
const fs = require('node:fs');

const APP_URL = 'https://app.immigrationhorizons.com';
const PUBLIC_URL = 'https://immigrationhorizons.com';
const PRIVATE_DOCUMENT_ROOT = '/srv/immigration-horizons/shared/private-documents';

/** Minimal dotenv parsing: KEY=VALUE, optional quotes, `#` comment lines. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const PLACEHOLDER = /<[^>]*>|change[-_ ]?me|your[-_ ]|example\.invalid|xxxx/i;
const isUrl = (v) => /^https?:\/\/[^\s/]+/i.test(v);

// Each rule returns '' when the value is acceptable, otherwise a SHORT reason that never quotes the value.
const rules = {
  nodeEnvProduction: (v) => (v === 'production' ? '' : 'must be "production"'),
  mongoUri: (v) => (/^mongodb(\+srv)?:\/\/[^\s]+/.test(v) && !PLACEHOLDER.test(v) ? '' : 'must be a real mongodb:// or mongodb+srv:// URI'),
  appUrl: (v) => (v === APP_URL ? '' : `must be exactly ${APP_URL}`),
  publicUrl: (v) => (v === PUBLIC_URL ? '' : `must be exactly ${PUBLIC_URL}`),
  httpsUrl: (v) => (isUrl(v) && v.startsWith('https://') ? '' : 'must be an https:// URL'),
  documentRoot: (v) => (v === PRIVATE_DOCUMENT_ROOT ? '' : `must be ${PRIVATE_DOCUMENT_ROOT} (shared, outside every release and public directory)`),
  sessionSecret: (v) => (v.length >= 32 && !PLACEHOLDER.test(v) ? '' : 'must be at least 32 characters and not a placeholder'),
  adminPassword: (v) => (v.length >= 12 && !PLACEHOLDER.test(v) ? '' : 'must be at least 12 characters and not a placeholder'),
  nonEmpty: (v) => (v.trim() && !PLACEHOLDER.test(v) ? '' : 'must not be empty or a placeholder'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /<[^@]+@[^>]+>/.test(v) ? '' : 'must be an email address'),
  resendKey: (v) => (/^re_/.test(v) ? '' : 'does not look like a Resend key'),
  gtm: (v) => (/^GTM-[A-Z0-9]+$/.test(v) ? '' : 'must look like GTM-XXXXXXX'),
  ga: (v) => (v === 'off' || /^G-[A-Z0-9]+$/.test(v) ? '' : 'must look like G-XXXXXXXXXX, or "off" when GA4 lives inside GTM'),
  timezone: (v) => (/^[A-Za-z_]+(\/[A-Za-z_+-]+)+$|^UTC$/.test(v) ? '' : 'must be an IANA timezone such as America/New_York'),
};

const COMMON = [
  ['NODE_ENV', 'nodeEnvProduction', true],
  ['MONGODB_URI', 'mongoUri', true],
  ['PRIVATE_DOCUMENT_ROOT', 'documentRoot', true],
  ['EMAIL_FROM', 'email', true], // "Name <addr@host>" is the normal form, so it is not run through the placeholder check
  ['CONTACT_RECEIVER_EMAIL', 'email', true],
  ['APP_TIMEZONE', 'timezone', false],
];

const PROFILES = {
  root: [
    ...COMMON,
    // Both are load-bearing: SITE_URL drives the CSRF Origin check for every portal AND staff write and the
    // activation / reset links; a wrong value makes every write fail with 403.
    ['SITE_URL', 'appUrl', true],
    ['NEXT_PUBLIC_SITE_URL', 'publicUrl', true],
    ['NEXT_PUBLIC_GTM_ID', 'gtm', false],
    ['NEXT_PUBLIC_GA_MEASUREMENT_ID', 'ga', false],
  ],
  server: [
    ...COMMON,
    ['SESSION_SECRET', 'sessionSecret', true],
    ['SITE_URL', 'httpsUrl', true],
    // Break-glass fallback credential policy: the pair must be present together and strong.
    ['ADMIN_USERNAME', 'nonEmpty', true],
    ['ADMIN_PASSWORD', 'adminPassword', true],
  ],
};

/** Mail needs ONE working transport: Resend key, or SMTP host. Reported as a single pseudo-key. */
function mailTransport(env) {
  const resend = env.RESEND_API_KEY || '';
  const smtp = env.SMTP_HOST || '';
  if (resend && rules.resendKey(resend) === '') return { status: 'SET', detail: 'resend' };
  if (smtp) return { status: 'SET', detail: 'smtp' };
  if (resend) return { status: 'INVALID SHAPE', detail: rules.resendKey(resend) };
  return { status: 'MISSING', detail: 'set RESEND_API_KEY or SMTP_HOST' };
}

/** Returns `[{ key, required, status, detail }]` for one profile. */
function audit(profile, env) {
  const rows = PROFILES[profile].map(([key, rule, required]) => {
    const value = env[key];
    if (value === undefined || value === '') return { key, required, status: 'MISSING', detail: '' };
    const problem = rules[rule](value);
    return { key, required, status: problem ? 'INVALID SHAPE' : 'SET', detail: problem };
  });
  const mail = mailTransport(env);
  rows.push({ key: 'MAIL transport', required: true, status: mail.status, detail: mail.detail });
  return rows;
}

const failed = (rows) => rows.filter((r) => r.required && r.status !== 'SET');

module.exports = { parseEnv, audit, failed, PRIVATE_DOCUMENT_ROOT };

if (require.main === module) {
  const [mode, ...files] = process.argv.slice(2);
  const targets = mode === 'both' ? [['root', files[0]], ['server', files[1]]] : [[mode, files[0]]];
  if (!PROFILES[targets[0][0]] || targets.some(([, f]) => !f)) {
    console.error('usage: check-env.js root|server <env-file>   |   check-env.js both <root.env> <server.env>');
    process.exit(2);
  }
  let bad = 0;
  const parsed = {};
  for (const [profile, file] of targets) {
    if (!fs.existsSync(file)) {
      console.error(`${profile}: ${file} does not exist`);
      process.exit(1);
    }
    parsed[profile] = parseEnv(fs.readFileSync(file, 'utf8'));
    const rows = audit(profile, parsed[profile]);
    console.log(`\n== ${profile} (${file})`);
    for (const r of rows) console.log(`${r.status.padEnd(14)} ${r.required ? 'required' : 'optional'}  ${r.key}${r.detail ? `  — ${r.detail}` : ''}`);
    bad += failed(rows).length;
  }
  if (parsed.root && parsed.server) {
    const same = parsed.root.PRIVATE_DOCUMENT_ROOT && parsed.root.PRIVATE_DOCUMENT_ROOT === parsed.server.PRIVATE_DOCUMENT_ROOT;
    console.log(`\n${same ? 'MATCH   ' : 'MISMATCH'} PRIVATE_DOCUMENT_ROOT is ${same ? 'identical' : 'NOT identical'} in both apps (they must share one private directory)`);
    if (!same) bad += 1;
  }
  console.log(bad ? `\n${bad} required item(s) need attention. No values were printed.` : '\nAll required keys are present and well-formed. No values were printed.');
  process.exit(bad ? 1 : 0);
}
