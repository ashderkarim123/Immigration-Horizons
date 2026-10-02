# Angular Staff Cutover Runbook (Release Gate 01)

**Authority:** `docs/architecture/ADR-024-angular-staff-production-cutover.md`
**Audience:** the production operator (someone with `deploy` SSH access, `sudo` for nginx, Atlas access and GitHub access).
**Contains no secrets.** Every `<PLACEHOLDER>` is filled in by the operator at the time; never paste a credential into this file, a ticket or a CI log.

---

## 0. What this release does — and what it deliberately does not

```text
BEFORE                                        AFTER (Step B)

app.immigrationhorizons.com                   app.immigrationhorizons.com
  everything  ───────────────► Next.js :3000    /api/v1/*  ────────────► Express :4000   (canonical staff API)
                                                /staff/*   ────────────► Angular static  (active release)
                                                everything else ───────► Next.js :3000   (/portal, /api/portal, …)
immigrationhorizons.com  ─────► Next.js
admin.immigrationhorizons.com ► Express/EJS    (unchanged)
```

- **Unchanged:** the public site, the client portal (Next.js), the admin CMS (Express/EJS), the database, sessions, the legacy Next.js staff UI (kept as the routing rollback).
- **Not in this release:** Angular `admin-console`, USCIS Tracking (Phase 11), client-portal migration, retirement of any legacy route, CORS, SSO, new infrastructure.

The cutover is **two deliberate steps**, so code can be proven healthy before any traffic moves:

| Step | What happens | Reversible by |
|---|---|---|
| **A — deploy code** | The merged release is built on the VPS. The Angular build lands on disk in `…/current/static/staff/`. **nginx is not touched**, so Angular receives no traffic. | `ln -sfn` to the previous release |
| **B — switch routing** | One `include` line is added to the live app-host nginx server block; nginx is reloaded. | Remove that one line, `nginx -t`, reload |

Never do Step B in the same sitting as an unverified Step A.

---

## 1. Release SHA

Record before starting. The release is **exactly one commit**: the `main` SHA that CI went green on.

```text
Enterprise branch SHA that was approved : <ENTERPRISE_SHA>      (from the Release Gate 01 report)
main SHA after merge                    : <MAIN_SHA>
CI run (number / id) on <MAIN_SHA>      : <CI_RUN> / <CI_RUN_ID>   — all four jobs must be green
Previous production release directory   : <PREVIOUS_RELEASE>      (see §2)
```

```bash
ssh deploy@<VPS_HOST>
ls -1dt /srv/immigration-horizons/releases/*/ | head -3       # newest first; the first is what `current` points at
readlink -f /srv/immigration-horizons/current                  # → write this down as <PREVIOUS_RELEASE>
```

---

## 2. Prerequisites — access and secrets

- [ ] SSH as `deploy` to the VPS, plus `sudo` for nginx (Step B only).
- [ ] GitHub: permission to merge to `main` and to view Actions.
- [ ] MongoDB Atlas: permission to take/restore a snapshot and to view the production database.
- [ ] The GitHub `production` environment secrets are configured (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) — without them the automatic deploy in §6 fails at the SSH step.
- [ ] Test accounts exist (do **not** use real client data for destructive QA): an **admin**, a **reviewer**, a **non-admin specialist** (petition writer or forms specialist), and a **test client** with one controlled **test case**.
- [ ] A browser profile with no stale `app.immigrationhorizons.com` cookies (use a private window for QA).

---

## 3. Backup — before ANY production write

No index build, migration, seed or provisioning happens until this is recorded.

- [ ] **Atlas:** take a fresh manual snapshot (or confirm a scheduled snapshot younger than a few hours). Record the snapshot id/timestamp (not credentials): `<BACKUP_ID>` / `<BACKUP_TIME>`.
- [ ] **Private documents** (outside the DB): confirm they are covered by the VPS-level snapshot, or copy them:
  ```bash
  sudo tar -C /srv/immigration-horizons/shared -czf /root/ih-private-documents-$(date -u +%Y%m%d%H%M).tgz private-documents
  ```
- [ ] **Admin uploads:** same for `shared/uploads`.
- [ ] **nginx:** done in Step B (§14), but note now where the backup directory will be: `/root/nginx-backup/`.
- [ ] Confirm the restore procedure exists in `DEPLOYMENT.md` Part 8 and who executes it.

Record: `Backup confirmed by <NAME> at <TIME>`.

---

## 4. Environment audit (no values printed)

The helper reports only `SET` / `MISSING` / `INVALID SHAPE` per key.

```bash
# Run against the files production actually reads. Works before the release is deployed:
git -C /srv/immigration-horizons/repo-cache fetch --quiet --all
git -C /srv/immigration-horizons/repo-cache show <MAIN_SHA>:scripts/deploy/check-env.js > /tmp/ih-check-env.js
node /tmp/ih-check-env.js both /srv/immigration-horizons/shared/root.env /srv/immigration-horizons/shared/server.env
rm -f /tmp/ih-check-env.js
```

Expected: every **required** key `SET`, and `MATCH PRIVATE_DOCUMENT_ROOT`. Fix anything else before continuing.

What the audit enforces and why:

| Key | Rule | Why it matters |
|---|---|---|
| root `SITE_URL` | exactly `https://app.immigrationhorizons.com` | CSRF `Origin` check for every portal and staff write in Next, and the activation/reset links. Wrong value ⇒ every write is a 403 |
| root `NEXT_PUBLIC_SITE_URL` | exactly `https://immigrationhorizons.com` | canonical/OG URLs |
| both `NODE_ENV` | `production` | secure cookies, `trust proxy`, no index auto-build |
| both `MONGODB_URI` | real `mongodb(+srv)://`, not a placeholder | **without it leads email but are never saved** |
| both `PRIVATE_DOCUMENT_ROOT` | `/srv/immigration-horizons/shared/private-documents`, identical in both | private client documents must live outside every release and public directory |
| server `SESSION_SECRET` | ≥ 32 chars, not a placeholder | admin CMS sessions |
| server `ADMIN_USERNAME` / `ADMIN_PASSWORD` | both set, password ≥ 12 chars | break-glass credential policy |
| both mail | a Resend key **or** `SMTP_HOST`; `EMAIL_FROM`, `CONTACT_RECEIVER_EMAIL` | lead notification + activation emails |
| root `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional, well-formed (`GA` may be `off`) | **the release must not regress public analytics** — if you did not set them the code defaults apply |

Also verify the directory itself (it is not part of any release):

```bash
ls -ld /srv/immigration-horizons/shared/private-documents        # expect drwx------ deploy deploy
```

Do **not** change the storage location in this release.

---

## 5. Dry runs that touch nothing

These are read-only. Run them from the **current** release after Step A (they need the release's code); the *review* of their output happens before §11/§12.

CI has already run: root and server test suites, `npm run db:indexes:dry-run`, `bash -n scripts/deploy/deploy.sh`, the Angular build and `scripts/deploy/verify-staff-build.js`. Do not repeat those on the server.

---

## 6. Release approval and merge to `main`

> **Merging to `main` starts Step A automatically.** `.github/workflows/deploy.yml` runs after CI succeeds on `main`. Merge only when §3 (backup) and §4 (env audit) are done and the approver has signed off.

- [ ] Release report read and approved: `docs/implementation/RELEASE_GATE_01_ANGULAR_STAFF_CUTOVER_REPORT.md`.
- [ ] Enterprise branch is not behind `main`:
  ```bash
  git fetch origin --prune
  git rev-list --left-right --count origin/main...origin/architecture/angular-enterprise-platform   # expect "0   <N>"
  ```
- [ ] Open a PR `architecture/angular-enterprise-platform` → `main`; review; merge through GitHub (merge commit or fast-forward — **no squash**, so the phase history and the GA4/GTM commit stay in ancestry).
- [ ] Record `<MAIN_SHA>` (§1).

To deploy by hand instead of waiting for the workflow: GitHub → Actions → *Deploy to production* → *Run workflow* with `ref=<MAIN_SHA>`.

---

## 7. CI on the exact `main` SHA

- [ ] The CI run for `<MAIN_SHA>` shows **Tests (Next.js app)**, **Lint · types · build**, **Enterprise UI (Angular)** and **Tests (admin CMS)** all green. If any is red, the deploy workflow will not run — stop and fix.

---

## 8. Step A — deploy the code

Watch the workflow *Deploy to production*, or on the VPS:

```bash
tail -f /srv/immigration-horizons/shared/logs/*.log        # in a second terminal
```

`deploy.sh` now (in this order, all before `current` moves): installs three dependency trees with `npm ci`, builds Next.js, syntax-checks the admin entrypoint, **builds the Angular staff app**, copies it into `<release>/static/staff/`, runs `verify-staff-build.js`, and only then activates and verifies. A failure anywhere before activation removes the half-built release and leaves the live release untouched. After activation it verifies `:3000/`, `:4000/admin/login`, **`:4000/api/v1/health`** and the presence of `static/staff/index.html`, and rolls back automatically if any fail.

Confirm on the VPS:

```bash
readlink -f /srv/immigration-horizons/current                    # the new release
ls -la /srv/immigration-horizons/current/static/staff | head      # index.html + hashed main-*.js, polyfills-*.js, chunk-*.js, styles-*.css
grep -o '<base href="[^"]*">' /srv/immigration-horizons/current/static/staff/index.html     # → <base href="/staff/">
pm2 status                                                        # ih-web x2 + ih-admin online, restarts not climbing
curl -fsS http://127.0.0.1:4000/api/v1/health                     # → {"data":{"status":"ok",…}}
```

---

## 9. Step A smoke — everything must look exactly as before

nginx still sends all of `app.*` to Next.js, so **staff is still the legacy Next.js UI**. A bare 200 is not enough; look at each page.

| URL | Expect (before Step B) |
|---|---|
| `https://immigrationhorizons.com/` | marketing homepage; view source: GTM + GA4 present |
| `https://app.immigrationhorizons.com/portal/login` | client login page |
| `https://app.immigrationhorizons.com/staff/login` | **legacy Next.js** staff login (not Angular) |
| `https://app.immigrationhorizons.com/api/v1/health` | **not** the API yet (a redirect to the public host, or 404) — this proves nothing has moved |
| `https://admin.immigrationhorizons.com/admin/login` | admin CMS login |

Also: sign in as a staff user in the legacy UI and visit `https://app.immigrationhorizons.com/` — you are redirected (307) to `/staff/`, which Next normalises to `/staff` and renders the legacy dashboard. Sign out and visit `/` → the client portal login. Submit one test consultation on the public site and confirm the lead is stored and the email arrives.

**Stop here if anything differs.** Routing rollback is not needed (nothing moved): use §25 if the release itself is unhealthy.

---

## 10. Production index dry run

Prerequisite: backup confirmed (§3). Read-only; makes no connection.

```bash
cd /srv/immigration-horizons/current/server
npm run db:indexes:dry-run
```

Review the list. It is **additive `createIndexes()` only** — never `syncIndexes()`, nothing is dropped. Confirm it includes the collections added through Filing Packets, in particular:

`case_smart_forms`, `smart_form_templates`, `smart_form_audits`, `case_petitions`, `petition_versions`, `filing_packets`, `filing_packet_versions`

(plus the earlier case/document/chat/notification collections if they were never built in production).

## 11. Production migration dry run

Read-only by default.

```bash
cd /srv/immigration-horizons/current
npm run db:migrate
```

Review each migration's counts and its "left untouched" samples. **Do not bulk-apply.** The runner registers 001 (notification recipient identity), 002 (link consultations to clients), 003 (link tasks to cases). Smart Forms, Petitions and Filing Packets are lazy/additive and need **no** migration or backfill. (Note: `scripts/migrations/004-seed-evidence-templates.ts` exists in the repo but is not registered in the runner — do not expect `db:migrate` to run it.)

## 12. Apply production indexes (only after approval)

Conditions — all must be true: backup recorded (§3) · §10 output reviewed and approved · low-traffic window · operator and approver present.

```bash
cd /srv/immigration-horizons/current/server
npm run db:indexes                 # createIndexes(); builds only what is missing
```

Record the printed counts. Verify (mongosh, read-only) for at least one new collection:

```text
db.case_smart_forms.getIndexes()        db.case_petitions.getIndexes()        db.filing_packets.getIndexes()
```

Expect the unique `{case, templateKey, templateVersion}`, `{case, sequence}` (petitions and packets) and `{packet|petition, versionNumber}` indexes. These unique indexes are what make provisioning and version numbering safe under concurrency, so **do not enable Angular staff traffic before they exist**.

## 13. Apply a migration (only if explicitly approved as required for launch)

Default answer: **none**. If a specific migration is approved:

```bash
cd /srv/immigration-horizons/current
npm run db:migrate -- --apply --i-have-a-backup --only <MIGRATION_ID>
```

Run it twice: the second pass must report zero changes (idempotent). Leave ambiguous records untouched.

### Smart Form templates (optional)

Not needed: the first `provision` call seeds the versioned catalog (insert-only) and creates the case's forms; repeating it is idempotent. To seed proactively:

```bash
cd /srv/immigration-horizons/current/server
npm run forms:seed-templates              # dry run — lists what would be created
npm run forms:seed-templates:apply        # only if you want it
```

---

## 14. Step B — back up the live nginx config

```bash
sudo mkdir -p /root/nginx-backup
STAMP=$(date -u +%Y%m%d%H%M%S)
sudo cp -a /etc/nginx/sites-available/app.immigrationhorizons.com /root/nginx-backup/app.immigrationhorizons.com.$STAMP
sudo cp -a /etc/nginx/snippets /root/nginx-backup/snippets.$STAMP 2>/dev/null || true
ls -l /root/nginx-backup/                                   # confirm; write down $STAMP
```

The live file is **not** the repo template: certbot has rewritten it (TLS, http→https redirect). **Do not copy the template over it.** Step B adds one line.

## 15. Install the routing snippet and check file access

```bash
sudo mkdir -p /etc/nginx/snippets
sudo install -m 644 /srv/immigration-horizons/current/scripts/deploy/nginx/snippets/ih-app-staff-routes.conf /etc/nginx/snippets/ih-app-staff-routes.conf

# nginx's worker user must be able to read the active release through the `current` symlink:
sudo -u www-data test -r /srv/immigration-horizons/current/static/staff/index.html && echo "readable" || echo "NOT READABLE"
namei -l /srv/immigration-horizons/current/static/staff/index.html     # every directory must be o+x (or group www-data)
```

If it is not readable, fix the directory modes (`chmod o+x /srv/immigration-horizons /srv/immigration-horizons/releases`) — do **not** loosen `shared/private-documents` (it stays `700`).

Now edit the live HTTPS server block. Find it, and add the include **above `location / {`**:

```bash
sudo grep -n "server_name\|listen\|location /\|ssl_certificate" /etc/nginx/sites-available/app.immigrationhorizons.com
sudoedit /etc/nginx/sites-available/app.immigrationhorizons.com
```

```nginx
    # Release Gate 01 — remove this one line to return staff to the legacy Next.js UI
    include /etc/nginx/snippets/ih-app-staff-routes.conf;

    location / {
        proxy_pass http://127.0.0.1:3000;
        …
```

It must be inside the `server { listen 443 ssl … }` block (the one that has `ssl_certificate`). The port-80 block is certbot's redirect and needs nothing.

## 16. Test the configuration

```bash
sudo nginx -t
```

Must print `syntax is ok` and `test is successful`. **If it does not, do not reload** — fix the file, or restore the backup (§24). A failing `nginx -t` has not affected live traffic.

(The repo's CI cannot run `nginx -t`; this step is the real syntax check.)

## 17. Reload

```bash
sudo systemctl reload nginx
sudo nginx -T 2>/dev/null | grep -n "ih-app-staff-routes"            # the include is active
curl -sS -o /dev/null -w "%{http_code}\n" https://app.immigrationhorizons.com/api/v1/health      # 200
curl -sS -I https://app.immigrationhorizons.com/staff/login | head -5                            # 200, text/html, Cache-Control: no-cache
```

---

## 18. Angular staff QA — `https://app.immigrationhorizons.com/staff/`

Use a private window. Keep DevTools → Network open: every API call must be `https://app.immigrationhorizons.com/api/v1/…`, **never** another host, with **no CORS error**.

**Session and cookie**

- [ ] `/staff/login` shows the Angular login. Sign in as the **admin**. Application → Cookies: `ih_staff_session` on `app.immigrationhorizons.com`, **HttpOnly, Secure, SameSite=Lax, Path=/**, no Domain.
- [ ] Reload the page (session refresh): still signed in. Sign out: back at `/staff/login`; the cookie is cleared.
- [ ] If the account requires a password change: the `/staff/setup-password` flow completes.
- [ ] A write succeeds (e.g. create a task): proves the `Origin` check accepts the app host. A 403 "Untrusted origin" here means the browser is not sending the app origin — stop and look at nginx `proxy_set_header`.

**Deep links and refresh** (type each into the address bar and press Enter, then refresh): `/staff/login`, `/staff/dashboard`, `/staff/cases`, `/staff/cases/<test-case-id>`, `/staff/tasks`, `/staff/deadlines`. Each renders Angular (not a 404, not the Next.js UI). Also open the exact `/staff` (no slash): it renders Angular.

**Assets:** Network tab — `main-*.js`, `chunk-*.js`, `styles-*.css` are `200` with `Cache-Control: max-age=…`; `index.html` is `no-cache`. Request `/staff/main-NOTREAL.js`: `404`.

**Admin / manager:** dashboard · clients · cases · case overview and team (add/remove a member) · tasks and deadlines · evidence · documents (upload, view versions, **download**) · chat (send, attach) · Forms (provision twice — second is a no-op; edit; submit; review) · Petition (provision, assign, draft/autosave, review, approve) · Filing Packet (create, pin a finalized petition version, add accepted documents, reorder, submit, approve) · logout.

**Specialist (petition writer or forms specialist):** only authorised navigation and actions are visible; works only on the assigned case/sections; the manager/finalizer buttons are absent, and a hand-crafted call to them is rejected (403/404).

**Reviewer:** reviews and approves a petition; approves **and finalizes** a filing packet; downloads one pinned document version; **Print manifest** opens a manifest page.

**Removed member:** remove the specialist from the test case's team; their very next request for that case is a 404.

**Mobile:** open `/staff/login` and `/staff/dashboard` on a phone-width viewport: no horizontal scroll, menu usable.

## 19. Client portal QA (still Next.js)

- [ ] `/portal/login`: sign in as the test client; case list; case detail; documents (upload, **download**); Smart Forms (edit, autosave, submit); chat (send, **attach a file**, read/unread); notifications; sign out.
- [ ] A staff cookie never opens a portal page and a client session never opens `/staff/` (each is redirected to its own login).
- [ ] `/portal/*` and `/api/portal/*` are not intercepted by the new routes (they still reach Next).

## 20. Public QA

- [ ] Homepage, a service page, `/sitemap.xml`, `/robots.txt`.
- [ ] Submit a consultation: the lead is stored **and** the notification email arrives.
- [ ] View source on a public page: GTM and GA4 present on the public layout only (not on `/portal` or `/staff`). Conversion events carry no personal data.
- [ ] Mobile rendering.

## 21. Admin CMS QA

- [ ] `https://admin.immigrationhorizons.com/admin/login`: sign in; the session persists across pages.
- [ ] Dashboard · leads · users · cases · tasks · documents · blog · SEO · media · settings all load. Angular admin-console is **not** part of this release.

---

## 22. Observation (first hours, then daily for the observation window)

```bash
pm2 status                                          # restarts must not climb
pm2 logs ih-web   --lines 200
pm2 logs ih-admin --lines 200                       # staff API 5xx and Mongo errors appear here
sudo tail -n 200 /var/log/nginx/error.log
sudo grep -E '" (401|403|409|5[0-9]{2}) ' /var/log/nginx/access.log | grep -E '/api/v1/|/staff/' | tail -50
```

Watch for: a burst of **403** on staff mutations (trusted-origin or `SITE_URL`), **401** loops (cookie not being sent), **409** (stale-revision conflicts are normal at low rates), **5xx** on `/api/v1`, Mongo connection or index errors, document download/storage errors, public lead/email failures. No new observability tooling is introduced; use what exists.

---

## 23. Troubleshooting (symptom → cause)

| Symptom | Likely cause |
|---|---|
| `/staff/` is 403 from nginx | worker user cannot read `current/static/staff` (§15) |
| `/staff/` is 404 | the release has no `static/staff` (an older release is `current` — see §25 note), or the include is in the wrong server block |
| `/staff/` shows the **legacy** UI | the include is not active (`nginx -T \| grep ih-app`), or the include is in the port-80 block |
| Angular loads but every API call is 401 | the cookie was set without `Secure`/on another host — check `X-Forwarded-Proto` is forwarded and you are on `app.immigrationhorizons.com` |
| Mutations return 403 "Untrusted origin" / "Missing Origin" | the request is not coming from `*.immigrationhorizons.com` or a proxy is stripping `Origin` |
| `/api/v1/health` is a redirect to the public host | the include is not active: Next.js is answering |
| Blank page, console error loading a chunk after a deploy | a tab opened before the deploy asks for an old hashed file (404 by design) — reload |

---

## 24. Rollback A — routing only (preferred first response to any Angular staff issue)

Returns staff to the legacy Next.js UI. No database, release or process change.

```bash
sudo cp -a /root/nginx-backup/app.immigrationhorizons.com.<STAMP> /etc/nginx/sites-available/app.immigrationhorizons.com
sudo nginx -t
sudo systemctl reload nginx
curl -sS -I https://app.immigrationhorizons.com/staff/login | head -5      # legacy Next.js again
```

Equivalent without the backup: delete the single `include /etc/nginx/snippets/ih-app-staff-routes.conf;` line, then `nginx -t` and reload. As a last resort the repo keeps the previous Next-only routing at `scripts/deploy/nginx/rollback/app.immigrationhorizons.com.next-only.conf` (it has no TLS block: merge it by hand or re-run `sudo certbot --nginx`; prefer the backup).

Why this is safe for browsers: neither nginx nor the app issues a **permanent** redirect on `/staff`. `/` → `/staff/` is a `307`, and nginx serves `/staff` directly instead of redirecting. (Next.js itself answers `/staff/` with a `308` to `/staff`; a browser that cached that still lands on a working page in both configurations.)

Signed-in staff are unaffected by a routing rollback: the legacy UI reads the same `ih_staff_session` cookie and session store.

## 25. Rollback B — release (backend, public, portal or admin regression)

```bash
ls -1dt /srv/immigration-horizons/releases/*/ | head -5          # pick <PREVIOUS_RELEASE>
ln -sfn <PREVIOUS_RELEASE> /srv/immigration-horizons/current
pm2 reload <PREVIOUS_RELEASE>/ecosystem.config.js --update-env
pm2 save --force
```

Then verify the public site, `/portal/login`, `admin…/admin/login`.

> **Order matters if Step B is live.** The nginx snippet serves `/staff` from `…/current/static/staff/`. A release built **before** this gate has no such directory, so rolling `current` back to it while the include is active makes `/staff/` a 404. **Do Rollback A first (or in the same minute), then Rollback B.** A release built from this gate or later carries its own `static/staff/`, so rolling back between those releases rolls the Angular UI back with the API.

`deploy.sh` already rolls back automatically if the new release fails its own health checks.

## 26. Rollback C — database

No destructive down-migration exists or is assumed. Indexes are additive and normally stay. For genuine data corruption, follow the Atlas restore procedure in `DEPLOYMENT.md` Part 8 using `<BACKUP_ID>` — do not improvise reverse writes.

---

## 27. Final go / no-go checklist

**Before merge (GO requires all):**

- [ ] Release report approved; enterprise SHA `<ENTERPRISE_SHA>` is CI-green (4/4 jobs).
- [ ] Branch not behind `main`; GA4/GTM commit in ancestry.
- [ ] Backup recorded (`<BACKUP_ID>`, `<BACKUP_TIME>`).
- [ ] Env audit: all required `SET`, `MATCH PRIVATE_DOCUMENT_ROOT`, `SITE_URL` correct.
- [ ] Test accounts and a controlled test case exist (admin, reviewer, specialist, client).
- [ ] An operator with `sudo` and a second person for approval are available for a low-traffic window.

**After Step A (GO to Step B requires all):**

- [ ] `main` CI green; deploy succeeded; `current` is `<MAIN_SHA>`'s release; `static/staff/index.html` present with `<base href="/staff/">`.
- [ ] §9 smoke exactly as expected (legacy staff, portal, public, admin).
- [ ] Index dry run reviewed; indexes applied and verified (§12); migration decision recorded (default: none).

**After Step B (release is DONE only when all):**

- [ ] §17 checks pass; §18–§21 QA complete with the non-admin role and the removed-member check.
- [ ] No unexpected 4xx/5xx pattern in §22 for the agreed observation period.
- [ ] Routing rollback (§24) is understood by the on-call person and the backup `<STAMP>` is recorded.

**NO-GO / roll back if:** staff login or any staff write fails for a non-admin role · portal or public acquisition regresses (lead not stored or no email) · admin CMS login breaks · 5xx on `/api/v1` above baseline · documents cannot be downloaded.

```text
Step A completed  : <TIME>  by <NAME>
Indexes applied   : <TIME>  by <NAME>   (counts: <…>)
Step B completed  : <TIME>  by <NAME>
QA signed off     : <TIME>  by <NAME>
Observation ends  : <TIME>
```
