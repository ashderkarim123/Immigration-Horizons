# Deployment Guide — Immigration Horizons (New Stack)

Scope: this guide covers the **new** stack only —

- **`web/`** — the public Next.js 16 site (marketing pages, service pages, consultation/contact forms)
- **`web/server/`** — the standalone Express/EJS admin CMS (leads, blog, SEO, tasks, notifications)

Both apps share one MongoDB Atlas cluster/database (`immigration-horizons`, collection `consultations` in particular) but are deployed and run as **two independent Node processes**, typically on the same VPS behind the same reverse proxy, on different subdomains.

The legacy root Express+EJS app (repo root, port 3000) is **out of scope** — it has its own `DEPLOYMENT.md` at the repo root and stays live until an explicit cutover decision is made.

---

## Part 0 — Recommended topology

```
                      ┌────────────────────────────┐
Internet ── HTTPS ──▶ │  nginx (reverse proxy, TLS) │
                      └──────────────┬─────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 ▼                                       ▼
     immigrationhorizons.com                admin.immigrationhorizons.com
     (proxy → 127.0.0.1:3000)                (proxy → 127.0.0.1:4000)
                 │                                       │
        Next.js `web/`  (PM2: "ih-web")        Admin `web/server` (PM2: "ih-admin")
                 │                                       │
                 └───────────────┬───────────────────────┘
                                  ▼
                       MongoDB Atlas (shared cluster)
```

One VPS, one nginx, one PM2 process manager running two apps, one shared database. This is the simplest topology that satisfies every requirement in this guide (rollback, backups, SSL, independent restarts). A single-VPS Node/PM2/nginx stack is assumed throughout — if you deploy to a PaaS (Render/Railway/Fly.io) instead, skip Parts 5–7 and use the platform's own process/TLS/domain management, but keep every other section (env vars, backups, rollback, go-live checklist).

---

## Part 1 — Prerequisites

- A VPS (Ubuntu 22.04/24.04 recommended) with a public IP, SSH access, and root/sudo.
- Domain registrar access for `immigrationhorizons.com` (to point DNS).
- Node.js **20.x LTS** or newer installed on the server (Next.js 16 requires Node ≥ 20; matches what's used locally in this repo — confirm with `node -v` before deploying).
- A MongoDB Atlas cluster already provisioned, with:
  - Network Access → the VPS's public IP added to the IP allowlist (or `0.0.0.0/0` only if you also enforce strong DB-user credentials — a dedicated VPS IP entry is safer).
  - A database user with read/write on the `immigration-horizons` database.
- A [Resend](https://resend.com) account with an API key, and (recommended) a verified sending domain so `EMAIL_FROM` isn't stuck on `onboarding@resend.dev`.
- Git access to this repository from the server (deploy key or HTTPS token).

Install on the server:

```bash
# Node.js 20.x (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

# PM2 (process manager) — installed globally, used for both apps
sudo npm install -g pm2
```

---

## Part 2 — Required environment variables

Neither app validates these at build time (no schema/zod check exists in either codebase as of this phase) — missing values degrade silently rather than crash, so this checklist is the actual safety net. Go through it line by line before first deploy.

### `web/.env` (Next.js — copy from `web/.env.example`)

| Variable | Required? | Notes |
|---|---|---|
| `MONGODB_URI` | **Yes** | Without it, leads still email but are never saved to the DB — silent data loss. |
| `RESEND_API_KEY` | **Yes** | Without it, forms report success to visitors but nobody is emailed — only a server-side console warning. **Verify this is set; it is the single easiest way to silently lose every lead.** |
| `EMAIL_FROM` | Recommended | Defaults to Resend's shared sandbox sender — fine to launch with, but verify a domain in Resend and switch this to `notifications@immigrationhorizons.com` for deliverability/branding as soon as possible. |
| `CONTACT_RECEIVER_EMAIL` | Recommended | Where lead notification emails land. |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Must be `https://immigrationhorizons.com` in production — feeds canonical/OG URLs. Already defaults correctly, but set it explicitly so a staging value can never leak into a prod build. |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_WHATSAPP_NUMBER_1/2` | Recommended | Public-facing contact details, safe to expose in the client bundle. |

### `web/server/.env` (Admin CMS — copy from `web/server/.env.example`)

| Variable | Required? | Notes |
|---|---|---|
| `NODE_ENV=production` | **Yes** | Gates secure cookies, `trust proxy`, and startup guards below. **The server now refuses to start in production without this being set correctly alongside the two items below** (see Part 3 hardening notes). |
| `MONGODB_URI` | **Yes** | Same cluster as `web/`. Also required for the session store — **the server refuses to start in production if this is missing**, since sessions would otherwise fall back to in-memory (broken across restarts/multiple instances). |
| `SESSION_SECRET` | **Yes** | Must be a real random value, not the placeholder in `.env.example`. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. **The server refuses to start in production with the placeholder value.** |
| `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH` | **Yes** | Change from the default. Prefer `ADMIN_PASSWORD_HASH` (bcrypt) over plaintext `ADMIN_PASSWORD` — generate with `node -e "console.log(require('bcryptjs').hashSync('yourRealPassword', 12))"`. **The server refuses to start in production if `ADMIN_PASSWORD` is left at `admin`/`admin123`/`admin123456`.** |
| `ADMIN_USERNAME` | Recommended | Change from `admin` if you want a non-obvious fallback login identity (DB-backed users under **Users** are the real long-term auth path; this env pair is the break-glass fallback). |
| `SITE_URL` | Recommended | Set to `https://admin.immigrationhorizons.com` (or wherever the admin panel is reachable) — used in a few view-rendered links. |
| `PORT` | No | Defaults to `4000`. |
| `GOOGLE_*`, `RESEND_API_KEY` (in this app) | No | Only used to render a status string on `/admin/contact-form`; the actual Sheets/email sending happens in the legacy root app and (for email) in `web/`, not here. |

**Do not commit either `.env` file.** Both are already gitignored; confirm with `git check-ignore web/.env web/server/.env` before your first deploy.

---

## Part 3 — Local build verification (do this before touching the server)

```bash
# Next.js site
cd web
npm ci
npm run lint      # must be clean
npm run build     # must compile + typecheck; watch for ignored TS/ESLint errors — none are configured, so a real error fails the build

# Admin CMS
cd ../server
npm ci
node -e "require('./server.js')"   # sanity-check it boots locally with your .env; Ctrl+C to stop
```

If `npm run build` in `web/` fails, do not deploy — fix it first. There is no `ignoreBuildErrors`/`ignoreDuringBuilds` bypass configured in `next.config.ts`, so a clean local build is a reliable signal the production build will also succeed.

**Production-mode hardening now enforced by `web/server/server.js`** (added this phase — know these before your first prod boot, so you don't mistake an intentional refusal-to-start for a bug):

- Refuses to start if `NODE_ENV=production` and `SESSION_SECRET`/`ADMIN_PASSWORD` are left at their documented placeholder values.
- Refuses to start if `NODE_ENV=production` and no real `MONGODB_URI` is set (no persistent session store available).
- Session cookies get `secure: true` only when `NODE_ENV=production` — if you test a "production" build locally over plain HTTP, login will silently fail to persist (the cookie won't be sent back) unless you're actually on HTTPS or you temporarily unset `NODE_ENV`.

---

## Part 4 — Production build steps (on the server)

```bash
# --- clone / update ---
cd /var/www
git clone <your-repo-url> immigrationhorizons   # first time only
cd immigrationhorizons
git fetch origin
git checkout main                                # or whichever branch you're cutting over from
git pull

# --- web/ (Next.js) ---
cd web
cp .env.example .env        # then fill in real values, see Part 2
npm ci
npm run build

# --- web/server/ (Admin CMS) ---
cd ../server
cp .env.example .env        # then fill in real values, see Part 2
npm ci
```

The admin CMS is EJS-rendered server-side with no build step — `npm ci` is sufficient there.

---

## Part 5 — Process manager (PM2)

From `/var/www/immigrationhorizons`:

```bash
# Next.js site — production start
cd web
pm2 start npm --name ih-web -- start

# Admin CMS
cd ../server
pm2 start server.js --name ih-admin

# Persist across reboots
pm2 save
pm2 startup            # follow the printed command (runs once, registers a systemd unit)
```

Useful day-to-day commands:

```bash
pm2 status                 # see both processes, restart counts, uptime
pm2 logs ih-web            # tail Next.js logs
pm2 logs ih-admin          # tail admin CMS logs
pm2 restart ih-web         # restart after a redeploy of web/
pm2 restart ih-admin       # restart after a redeploy of web/server
```

PM2 auto-restarts a crashed process, which matters specifically for `ih-admin`: its `uncaughtException`/`unhandledRejection` handlers deliberately log-and-continue rather than exit (a documented choice to survive transient DB hiccups), so PM2's restart-on-crash is a backstop for the rarer case where that assumption doesn't hold, not the primary recovery mechanism.

---

## Part 6 — Reverse proxy (nginx) + SSL

### 6a. nginx server blocks

`/etc/nginx/sites-available/immigrationhorizons.com`:

```nginx
server {
    listen 80;
    server_name immigrationhorizons.com www.immigrationhorizons.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

`/etc/nginx/sites-available/admin.immigrationhorizons.com`:

```nginx
server {
    listen 80;
    server_name admin.immigrationhorizons.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The `X-Forwarded-Proto` header is **required** for the admin CMS: `web/server/server.js` sets `app.set('trust proxy', 1)` only when `NODE_ENV=production`, and secure session cookies depend on Express correctly reading `req.secure` from this header through the proxy. Without it, admin login will silently fail to keep users logged in (the `secure` cookie gets set, but the browser refuses to send it back on the next request unless the connection is genuinely recognized as HTTPS end-to-end).

```bash
sudo ln -s /etc/nginx/sites-available/immigrationhorizons.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/admin.immigrationhorizons.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6b. SSL (Let's Encrypt via certbot)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d immigrationhorizons.com -d www.immigrationhorizons.com
sudo certbot --nginx -d admin.immigrationhorizons.com
```

certbot rewrites the nginx server blocks above in place to add the `listen 443 ssl` directives and a redirect from port 80. Certificates auto-renew via a systemd timer (`systemctl list-timers | grep certbot`) — no manual cron needed.

---

## Part 7 — DNS / domain cutover

1. In your DNS provider, create/update:
   - `A` record: `immigrationhorizons.com` → VPS public IP
   - `A` record: `www.immigrationhorizons.com` → VPS public IP (or `CNAME` to the apex)
   - `A` record: `admin.immigrationhorizons.com` → VPS public IP
2. If `immigrationhorizons.com` currently points at the **legacy root app**, this is the actual cutover moment — the new Next.js site takes over the apex domain. Lower the DNS TTL to 300s a day beforehand so the change propagates quickly, and raise it back after confirming stability.
3. Confirm propagation before assuming it's live: `dig +short immigrationhorizons.com` from a machine outside your network, or use a third-party propagation checker.
4. Run the SSL step (6b) only after DNS has propagated — certbot's HTTP-01 challenge requires the domain to already resolve to this server.

---

## Part 8 — Database backup

Atlas (the cluster both apps share) has built-in continuous backups on paid tiers — confirm this is enabled in **Atlas → Backup** before go-live. In addition, take a manual pre-cutover snapshot:

```bash
# From any machine with mongodump and network access to the cluster
mongodump --uri="<MONGODB_URI>" --out=./backup-$(date +%F)

# Restore, if ever needed
mongorestore --uri="<MONGODB_URI>" ./backup-2026-07-26
```

Take this dump **immediately before** the DNS cutover in Part 7 and again immediately before any future schema-changing deploy (both `web/` and `web/server` write to the same `consultations` collection with independently-validated Mongoose schemas — a bad deploy on either side is a data-shape risk to the other).

---

## Part 9 — Post-deployment verification

Run every item; do not skip on the assumption "it built, so it works."

**Public site (`web/`):**
- [ ] `https://immigrationhorizons.com` loads, single `<h1>`, no console errors
- [ ] `/consultation` and `/contact` forms submit successfully (real test submission — see checklist below)
- [ ] `https://immigrationhorizons.com/robots.txt` and `/sitemap.xml` both resolve and list the real domain
- [ ] A 404 (e.g. `/this-does-not-exist`) renders the custom `not-found.tsx`, not a raw error
- [ ] No horizontal scroll at mobile/tablet/desktop widths

**Admin CMS (`web/server`):**
- [ ] `https://admin.immigrationhorizons.com/admin/login` loads over HTTPS
- [ ] Login succeeds and the session persists across a page reload (validates the `secure`/`trust proxy` wiring from Part 6a — this is the one most likely to silently break on a fresh nginx config)
- [ ] Dashboard, Leads, Task Board, Sprint Board, Notifications, Delivery, Blog, SEO, Testimonials, FAQs, Media, Settings, Users all load without error
- [ ] A real (or clearly test-labeled) lead submitted via the public site appears in **Leads** within a few seconds

**End-to-end lead pipeline (do this for real, not just a code read):**
1. Submit the consultation form on the live public site with a real, clearly-marked test entry (e.g. name "QA Test — delete me").
2. Confirm the notification email arrives at `CONTACT_RECEIVER_EMAIL`.
3. Confirm the lead appears in `/admin/leads` on the admin CMS.
4. Delete/clean up the test lead from the admin panel afterward.

If step 2 or 3 fails, check server logs (`pm2 logs ih-web` / `pm2 logs ih-admin`) before assuming env vars are wrong — both failure modes are silent-by-design (see Part 2) and only surface in logs.

---

## Part 10 — Rollback procedure

Both apps are plain git checkouts running under PM2 — rollback is a revert-and-restart, not a rebuild-from-scratch.

```bash
# 1. Identify the last known-good commit
cd /var/www/immigrationhorizons
git log --oneline -10

# 2. Roll back the code
git checkout <last-good-commit-sha>

# 3. Rebuild only what changed
cd web && npm ci && npm run build && pm2 restart ih-web
cd ../server && npm ci && pm2 restart ih-admin

# 4. If the bad deploy included a schema change that already wrote
#    incompatible documents, restore from the Part 8 backup instead of (or
#    in addition to) the code rollback:
mongorestore --uri="<MONGODB_URI>" --drop ./backup-<date>
```

Keep the previous production `.env` files backed up outside the repo (they're gitignored, so `git checkout` alone won't restore them) — e.g. `cp web/.env /root/backups/web.env.$(date +%F)` before every deploy.

**When to roll back vs. hotfix:** if the issue is cosmetic or isolated to one page, prefer a forward-fix (small commit, redeploy) over a rollback, since a rollback also discards any leads/data-model changes that shipped alongside the bug. Reserve rollback for anything that breaks lead capture, admin login, or the database connection.

---

## Part 11 — Common issues and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Admin login redirects back to `/admin/login` in a loop | `trust proxy`/`X-Forwarded-Proto` not reaching Express, so the `secure` cookie is set but never sent back | Confirm nginx config includes `proxy_set_header X-Forwarded-Proto $scheme;` (Part 6a) and that `NODE_ENV=production` is actually set in `web/server/.env` |
| Admin server won't start, logs "Refusing to start in production..." | A required env var (`SESSION_SECRET`, `ADMIN_PASSWORD`, `MONGODB_URI`) is missing or still a placeholder | This is an intentional startup guard added this phase — fill in the real value per Part 2, don't bypass it |
| Leads aren't arriving by email but do appear in the admin dashboard | `RESEND_API_KEY` unset or invalid | Check `pm2 logs ih-web` for `[leads] RESEND_API_KEY not set` or `[leads] Resend send failed`; this fails silently to the visitor by design (see `web/src/lib/leads.ts`) |
| Leads arrive by email but never appear in the admin dashboard | `MONGODB_URI` unset/unreachable from `web/`, or the VPS IP isn't Atlas-allowlisted | Check `pm2 logs ih-web` for `[leads] Failed to save lead to MongoDB`; verify Atlas Network Access includes this server's IP |
| Every single admin page 500s at once (not just DB-backed ones) | MongoDB Atlas is unreachable, and the session store failure isn't degrading gracefully | Should no longer happen after this phase's session-store resilience fix (`web/server/server.js`) — if it recurs, check `pm2 logs ih-admin` for `[session store] ... failed, continuing without session`; if that log line itself is missing, the fix regressed |
| Uploaded blog/media images 404 after a redeploy | Uploads live on local disk (`web/server/public/uploads/`) — a redeploy to a fresh container/instance loses them | This topology (git checkout + PM2 on one persistent VPS) keeps the same disk across deploys, so this shouldn't occur; it *will* occur if you ever move `web/server` to an ephemeral-filesystem platform (see the legacy app's root `DEPLOYMENT.md` "file-upload problem" section for the same issue explained in more depth) |
| `next build` fails with a type error that wasn't there in a previous build | A real regression, not a bypassed check — `next.config.ts` has no `ignoreBuildErrors`/`ignoreDuringBuilds` flag | Fix the actual error; do not add those flags as a shortcut |
| Google Sheets sync doesn't happen for a `web/` (new site) lead | Not a bug — Sheets sync was never ported to the new stack, only to the legacy root app (documented in `web/src/lib/leads.ts`) | Out of scope for this phase; flagged as a known gap below |

---

## Part 12 — Final go-live checklist

**Before DNS cutover:**
- [ ] `web/.env` and `web/server/.env` both filled in with real production values (Part 2)
- [ ] `npm run build` succeeds cleanly in `web/`
- [ ] Both apps boot successfully under PM2 on the VPS
- [ ] nginx configs pass `nginx -t`, SSL issued for both domains
- [ ] Atlas Network Access includes the VPS IP; a real DB user with least-privilege access is used (not the cluster admin)
- [ ] `SESSION_SECRET` and `ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH` are real, rotated values — confirmed by the server actually starting under `NODE_ENV=production` (it refuses to start otherwise)
- [ ] A pre-cutover `mongodump` backup exists (Part 8)
- [ ] DNS TTL lowered ahead of the cutover

**At cutover:**
- [ ] DNS updated (Part 7)
- [ ] Full Part 9 verification checklist passes, including a real end-to-end test lead
- [ ] Admin login works over HTTPS and survives a page reload

**After cutover:**
- [ ] Monitor `pm2 logs` on both apps for the first hour for unexpected errors
- [ ] Confirm the first *real* (non-test) lead completes the full pipeline (email + dashboard)
- [ ] DNS TTL raised back to normal once stable
- [ ] Rotate the pre-cutover backup into whatever regular backup cadence you keep long-term

**Known, deliberately out-of-scope gaps** (carried over from earlier phases, not addressed in this hardening pass — flag to the business owner, don't silently assume they're fixed):
- Google Sheets sync is not implemented in the new stack (`web/`) — only email + MongoDB.
- Uploaded media/blog images are local-disk only; a future migration to a multi-instance or ephemeral-filesystem host will need cloud storage (S3/Cloudinary) first.
- No CSRF token protection on admin forms (mitigated by `sameSite: 'lax'` session cookies, not eliminated) — full `csurf`-style protection across every admin form was out of scope for this pass given the size of that change relative to the phase's "no new features" instruction.
- The legacy root app's `models/BlogPost.js` has the same Mongoose-callback bug fixed in `web/server`'s copy this phase — not fixed there, since it's outside this stack.
