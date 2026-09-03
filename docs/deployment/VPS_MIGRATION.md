# Local → VPS migration: what must be true before you go live

**Written:** 2026-09-04 · Companion to the root `DEPLOYMENT.md`, which has
the actual commands. This document is the *readiness* check: what has to be
decided, provisioned, or fixed **before** those commands are worth running.

Read it top to bottom once. Sections 1–3 are blocking; 4–6 are the migration
itself; 7 is what to verify before you point DNS at it.

---

## 0. What you are deploying

Three applications, two Node processes, one database.

| Host | What | Process | Port |
|---|---|---|---|
| `immigrationhorizons.com` | Public marketing site | Next.js (repo root) | 3000 |
| `app.immigrationhorizons.com` | Client portal **and** staff console | *same* Next.js process | 3000 |
| `admin.immigrationhorizons.com` | Admin CMS | Express (`server/`) | 4000 |

The first two are **one process**, separated by host in `src/proxy.ts`. You
do not deploy them separately. `DEPLOYMENT.md` Part 0's diagram predates
ADR-008 and shows only two hosts — Part 6 has all three vhosts and is
correct.

---

## 1. Blocking decisions (make these first)

### 1.1 Database — MongoDB Atlas

Confirmed decision: **Atlas**, not MongoDB on the VPS. What you need:

- A cluster (M0 free tier is enough to launch; M10 when documents grow).
- A database named `immigration-horizons`.
- A database user with `readWrite` on that database — **not** an admin user.
- Network Access → add the VPS's public IP. Prefer a single IP entry over
  `0.0.0.0/0`.
- Note the connection string; it goes in **both** `.env` files, identical.

> Atlas gives you backups, TLS, and patching. That is why the guide assumes
> it. If you ever move Mongo onto the VPS, §5 (backups) and the whole of
> §3.2 become your responsibility rather than the provider's.

### 1.2 Mail — pick a transport and verify a domain

Since ADR-013 both transports work. The transport is a config choice, but
**deliverability is not** — and it is the part that actually breaks.

- **Resend** — set `MAIL_TRANSPORT=resend` and `RESEND_API_KEY`.
- **SMTP** — set `MAIL_TRANSPORT=smtp` plus `SMTP_HOST` / `SMTP_PORT` /
  `SMTP_USER` / `SMTP_PASSWORD`.

**Do not point SMTP at a mail server running on the VPS.** Mail sent
directly from a VPS IP is rejected or spam-foldered by essentially every
major provider — those ranges have poor reputation by default and you cannot
fix that from the server. Use a relay (Google Workspace, Zoho, Microsoft
365, Amazon SES, Resend) whichever transport you choose.

**Whatever you pick, you must verify the sending domain with the provider
and publish three DNS records:**

| Record | Why |
|---|---|
| **SPF** (TXT) | Says which servers may send as your domain |
| **DKIM** (TXT/CNAME) | Cryptographically signs your mail |
| **DMARC** (TXT) | Tells receivers what to do when the first two fail |

Without these, activation and password-reset emails send successfully and
land in spam — which looks identical to "email is broken" from the client's
side, and is worse because nothing logs an error.

`EMAIL_FROM` must be on that verified domain. The default
(`onboarding@resend.dev`) is for testing only.

### 1.3 Domain and DNS

Three A records pointing at the VPS IP:

```
immigrationhorizons.com        A   <vps-ip>
www.immigrationhorizons.com    A   <vps-ip>
app.immigrationhorizons.com    A   <vps-ip>
admin.immigrationhorizons.com  A   <vps-ip>
```

Plus the three mail records from §1.2.

> Set TTL low (300s) a day before cutover so a rollback is fast.

---

## 2. Blocking code/data work

These are the open deployment blockers from `CLAUDE.md`, with current status.

| # | Blocker | Status | What to do |
|---|---|---|---|
| 1 | **Indexes never run in production** | Open | §4.4 — one command |
| 2 | **Documents write to local disk** | Open, *acceptable on one VPS* | §2.1 |
| 3 | Admin CMS had no CSRF | **Closed** (ADR-012) | — |
| 4 | **Email never verified against a real provider** | Open | §4.5 — `mail:check` |
| 5 | **`SITE_URL` unset/wrong** | Open | §3.1 — the single highest-risk variable |
| 6 | No malware scanning; digest job unscheduled | Open | §2.2, §6 |
| 7 | **No retention purge for `security_events`** | **Closed** (ADR-014) | §6 — schedule it |

### 2.1 Local disk storage is fine *for now* — with one condition

Uploaded documents are written to `server/public/uploads/` and to the private
document store on local disk. This breaks on any multi-instance or ephemeral
host — but you are deploying **one VPS with persistent disk**, where it works
correctly.

The condition: **those directories must be in your backup**, because unlike
the database they have no provider-managed backup behind them. See §5.

Move to S3/Cloudinary before you add a second app instance, not before launch.

### 2.2 No malware scanning

Uploads are validated by extension, declared MIME type **and** magic bytes,
which stops a renamed executable. Nothing scans for malware. `scanner.ts`
returns `not_configured` and never reports "clean" — a deliberate design so
this gap cannot be mistaken for a passing scan.

This is an accepted risk at launch. Documented in `docs/security/THREAT_MODEL.md §4`.

---

## 3. Environment variables — the ones that actually bite

Copy `.env.example` → `.env` and `server/.env.example` → `server/.env`.
Both templates are now in the repo (they were missing until this cycle) and
document every variable inline.

Three deserve calling out because a wrong value fails in a confusing way:

### 3.1 `SITE_URL` — highest-risk variable in the system

It is **two different values** in the two files, and neither is the marketing
domain:

```bash
# .env            (Next.js — portal + staff)
SITE_URL=https://app.immigrationhorizons.com

# server/.env     (Admin CMS)
SITE_URL=https://admin.immigrationhorizons.com
```

In the root app it drives two things:

1. **The CSRF Origin check** on every mutating `/api/portal/*` and
   `/api/staff/*` route. Wrong value → **every client and staff write returns
   403**, while every page still loads perfectly. This is the failure mode
   that wastes an afternoon.
2. **Activation and password-reset links.** Wrong value → mail sends, and
   every link in it is broken.

Unset, it falls back to `http://localhost:3000` and both fail.

### 3.2 `APP_TIMEZONE` must match across both files

It defines "today" for the scheduled-consultation queues. Different values
mean the two apps disagree about which consultations are today. Use an IANA
zone (`America/New_York`); an abbreviation like `EST` is rejected and falls
back to UTC with a warning.

### 3.3 Secrets that block startup

The admin CMS **refuses to boot in production** if `NODE_ENV`, `MONGODB_URI`,
`SESSION_SECRET`, or `ADMIN_PASSWORD` are missing or left at placeholders.
That is intentional. Generate real values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('bcryptjs').hashSync('yourRealPassword', 12))" # ADMIN_PASSWORD_HASH
```

The env credentials are a **break-glass fallback**. Real accounts live under
`/admin/users`. Every use of the fallback is recorded in `security_events`
as `actorType: 'env_fallback'` and should be reconciled against a known
operator.

---

## 4. Migration sequence

Run in this order. Steps 4.4 and 4.5 are the ones that have never been done.

### 4.1 Provision the server

Ubuntu 22.04/24.04, Node 20+, nginx, PM2 — `DEPLOYMENT.md` Part 1.

Also, before anything else:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Ports 3000 and 4000 must **not** be open to the internet — nginx proxies to
them on loopback. Confirm with `sudo ufw status`.

### 4.2 Deploy the code

`DEPLOYMENT.md` Parts 4–5: clone, `npm ci`, `npm run build` in both apps,
start both under PM2, `pm2 save`, `pm2 startup`.

### 4.3 nginx + TLS

`DEPLOYMENT.md` Parts 6: three vhosts, then `certbot --nginx` for all four
names. Verify auto-renewal with `sudo certbot renew --dry-run`.

### 4.4 Create the database indexes — **never yet done in production**

Dry run first; it makes no connection and just prints what it would create:

```bash
npm run db:indexes:dry-run          # from repo root
npm run db:indexes                  # then, for real
cd server && npm run db:indexes     # and the CMS's own declarations
```

Additive only — it calls `createIndexes()` and never drops. Safe to re-run.

This matters beyond speed: several indexes are **unique** constraints
(`ClientUser.normalizedEmail`, `ClientCase.caseNumber`, channel read state).
Until they exist, nothing at the database level prevents duplicates.

### 4.5 Verify mail actually works — **never yet done**

For **both** apps separately; they read the same variable names from
different `.env` files:

```bash
npm run mail:check -- --send you@example.com              # repo root
cd server && npm run mail:check -- --send you@example.com # admin CMS
```

Then **open the message**. Check it arrived, and check whether it landed in
spam — that is a DNS question (§1.2), not an application one, and only a real
send answers it.

### 4.6 Run the data migrations (dry run first)

Only relevant if you are carrying existing data across. On a fresh database
both report zero and are no-ops.

```bash
npm run db:migrate                                     # DRY RUN — writes nothing
npm run db:migrate -- --apply --i-have-a-backup        # after reviewing the output
```

Two migrations: legacy notifications get their recipient identity, and
consultations get linked to the client accounts that own their address. Both
refuse to guess on ambiguous records and report them instead — read the
"UNRESOLVED" counts rather than skipping past them.

Both are idempotent. If one dies halfway, **run it again**; that is the
recovery, not a restore.

---

## 5. Backups — before cutover, not after

Two things need backing up, and only one is managed for you.

**Database** — Atlas has continuous backups on paid tiers. On M0 it does not:
take your own with `mongodump` (`DEPLOYMENT.md` Part 8) and schedule it.

**Uploaded documents** — nothing backs these up. They are on the VPS disk and
they are client identity documents, passports, degree certificates. Losing
them is not recoverable from anywhere.

```bash
# Nightly, to somewhere off the VPS
0 2 * * * tar -czf /backups/uploads-$(date +\%F).tar.gz \
  /path/to/app/server/public/uploads /path/to/app/server/private-uploads
```

Test a restore once before you rely on it.

---

## 6. Scheduled jobs

Nothing schedules itself. Add to cron:

```bash
# Notification digests — see server/scripts/sendNotificationDigests.js
0 8 * * *   cd /path/to/app/server && node scripts/sendNotificationDigests.js

# Retention purge — DRY RUN weekly so you see it coming; apply by hand
0 3 * * 0   cd /path/to/app && npm run db:purge
```

The purge is deliberately **not** automated to delete (ADR-014 §3). Review
the dry-run output, then run `--apply --i-have-a-backup` yourself.

---

## 7. Pre-cutover verification

Do all of this **before** DNS points at the new server (use `/etc/hosts`
overrides or the raw IP).

**Health**
- [ ] `pm2 list` shows both processes online, restart count 0
- [ ] All four hostnames serve HTTPS with a valid certificate
- [ ] Ports 3000/4000 unreachable from outside (`nmap` or `curl` from elsewhere)

**Host separation** (ADR-008 — routing, not authorization)
- [ ] `immigrationhorizons.com/portal` does **not** serve the portal
- [ ] `app.immigrationhorizons.com` serves `/portal/login` and `/staff/login`
- [ ] `curl -I https://app.immigrationhorizons.com/portal/login` shows
      `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`
- [ ] `https://immigrationhorizons.com/robots.txt` allows crawling;
      `app.*` and `admin.*` return `Disallow: /`

**The 403 trap** (this is what §3.1 is about)
- [ ] Log into the portal and **change something** — update your profile.
      A 403 here means `SITE_URL` is wrong. Page loads prove nothing.
- [ ] Same on `/staff` — change a case stage.

**Mail, end to end**
- [ ] Invite a client from the admin CMS; the email arrives
- [ ] The activation link points at `app.immigrationhorizons.com`, not localhost
- [ ] Activation completes and the client can log in
- [ ] Request a password reset; the link works
- [ ] Check the spam folder for all of the above

**Admin CMS**
- [ ] Log in with a real `/admin/users` account, not the env fallback
- [ ] Submit any form — a 403 means the CSRF token is not rendering
- [ ] Upload an image in Media (multipart + CSRF path)
- [ ] Five wrong passwords locks the account for 15 minutes

**Data**
- [ ] `db.security_events.getIndexes()` shows six indexes
- [ ] A login appears in `security_events` within seconds
- [ ] Submit a consultation on the public site; it lands in the DB *and* emails

**Rollback ready**
- [ ] You know the last-good commit (`git log --oneline -3`)
- [ ] You have a database backup taken today
- [ ] DNS TTL is low enough to move back quickly

---

## 8. Known gaps you are launching with

Stated plainly so they are decisions rather than surprises. All are tracked
in `docs/security/THREAT_MODEL.md §4`.

- **No malware scanning** on uploaded documents (§2.2)
- **No 2FA** on any surface
- **Documents on local disk** — fine on one VPS, blocks horizontal scaling
- **No client-initiated account deletion** — needs a legal position first
  (`docs/security/DATA_RETENTION.md §3`)
- **Append-only audit is enforced in the application layer only** — a raw
  driver connection can still rewrite `security_events`. Restrict the
  application's Mongo user to `readWrite` and keep admin credentials separate.
- **No error tracking or uptime monitoring** — Cycle 13
