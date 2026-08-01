# Immigration Horizons — Admin CMS

A standalone Express + EJS admin panel that manages the MongoDB behind the
Immigration Horizons website: leads, blog, testimonials, FAQs, SEO, media,
settings, and admin users. It runs independently of the Next.js frontend and
shares only the database.

## Run it

```bash
cd server
npm install
cp .env.example .env      # then fill in MONGODB_URI etc.
npm run seed              # optional: migrate existing testimonials/FAQs/settings
npm run dev               # http://localhost:4000/admin
```

## Login

Two ways to authenticate:

- **Environment credentials** — `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`
  (works even before any DB users exist).
- **Database users** — create named, role-based accounts under **Users**
  (`super_admin`, `admin`, `editor`). Passwords are hashed with bcrypt.

## Sections

| Route | What it manages |
|---|---|
| `/admin` | Dashboard — lead + content counts, recent activity |
| `/admin/leads` | Consultation leads — search, filter, paginate, detail, notes, delete, CSV export |
| `/admin/blog` | Blog posts — full CRUD, draft/publish, cover image, tags, SEO |
| `/admin/seo` | Per-page SEO metadata |
| `/admin/testimonials` | Client testimonials CRUD |
| `/admin/faqs` | FAQ CRUD (with homepage / service-page targeting) |
| `/admin/services` | Service page SEO overrides |
| `/admin/media` | Local media library — upload, copy URL, delete |
| `/admin/settings` | Company, social, analytics, SEO defaults, contact |
| `/admin/contact-form` | Read-only integration status (MongoDB / Sheets / Email) |
| `/admin/users` | Admin user management |

## Notes

- Uploaded files are stored locally in `public/uploads/`.
- The panel is resilient to the database being unreachable: it degrades to
  empty views rather than crashing.
- Lead notifications (Resend email) and Google Sheets syncing happen in the
  website's form handler, not here — this panel only reads and manages the
  stored data. The **Contact Form** page shows whether those integrations are
  configured.

## Testing

```bash
npm test                  # everything: permission-matrix unit tests, route-guard
                           # tests, XSS/CSV regression tests, and DB-backed
                           # integration tests
npm run test:integration  # only the DB-backed integration suites
npm run test:authorization # the authorization-focused subset (unit + integration)
```

`app.js` exports `createApp()` — an Express app builder with no side effects
(no `mongoose.connect`, no `app.listen`, no production startup guards). Tests
import that directly; `server.js` is the real-process bootstrap that wraps it
with those side effects.

**DB-backed integration tests** (`test/integration/*.test.js`) exercise real
HTTP requests through the actual app, a real login, a real session cookie,
and a real MongoDB — see `test/helpers/testDb.js`. They never read
`MONGODB_URI` (the app's real connection string). The test database is
resolved as:

1. **`mongodb-memory-server`** (default) — downloads and runs an isolated,
   throwaway `mongod` for the run. Requires outbound network access to fetch
   the binary the first time it's used on a machine; if that's blocked (a
   locked-down CI runner, an offline sandbox), tests fail fast with a clear
   error rather than hanging.
2. **`TEST_MONGODB_URI`** — set this env var to a disposable local MongoDB
   instance (e.g. `mongodb://127.0.0.1:27017/immigration-horizons-test`) to
   skip the download entirely. `test/helpers/testDb.js` refuses to run if
   this URI looks like a managed/production database (Atlas, any `+srv`
   host, an AWS/Azure/GCP hostname, or a path containing `prod`/`production`).

Never point `TEST_MONGODB_URI` at a database you care about — the suite
calls `dropDatabase()` on it after every run.

## Database indexes

Indexes are declared in the Mongoose schemas (`models/Consultation.js`,
`models/admin/Notification.js`) but are **not** created automatically on
app startup — `scripts/createIndexes.js` is a separate, explicit step so a
production rollout is a deliberate, observable action, not something that
happens silently on the next deploy.

```bash
npm run db:indexes:dry-run   # lists index specs that would be created — no writes
npm run db:indexes           # actually creates them (safe to re-run; MongoDB
                              # no-ops on an index that already exists with the
                              # same spec)
```

**Production procedure:**

1. Take a database backup (see `DEPLOYMENT.MD` in the site repo's `.claude/`
   docs for the existing `mongodump` procedure).
2. Run during low traffic — index builds on a large collection hold a
   background lock and add I/O load.
3. Run `npm run db:indexes:dry-run` against production `MONGODB_URI` first
   and review the output.
4. Run `npm run db:indexes`.
5. Re-run the dry-run (or `db.collection.getIndexes()` in `mongosh`) to
   confirm the indexes exist as expected.
6. Monitor application logs and query behavior for a period afterward.

The script never calls `syncIndexes()` (which can *drop* indexes not present
in the current schema) — only `createIndexes()`, which is additive.
