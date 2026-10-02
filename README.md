# Immigration Horizons

Platform for an immigration **consulting and petition-preparation practice** (not a law firm): a public marketing site, a client
portal, an employee case-management app, and an admin CMS.

| Surface | URL | Stack | Code |
|---|---|---|---|
| Marketing site (the only indexed one) | `immigrationhorizons.com` | Next.js 16 | `src/app/(site)/**` |
| Client portal | `app.immigrationhorizons.com/portal` | Next.js | `src/app/(app)/portal/**` |
| Staff case-management app | `app.immigrationhorizons.com/staff` | Angular | `enterprise-ui/projects/case-management` |
| Staff API | `app.immigrationhorizons.com/api/v1/staff` | Express | `server/routes/api/v1/staff/` |
| Admin CMS | `admin.immigrationhorizons.com` | Express + EJS | `server/` |

One MongoDB (Atlas) database is shared by all of them. Employee accounts (`AdminUser`) are shared by the CMS and the staff app;
client accounts (`ClientUser`) are separate.

## Working on it

```bash
npm install && npm run dev                 # Next.js site + portal, http://localhost:3000
cd server && npm install && npm run dev    # Express API + admin CMS, http://localhost:4000
cd enterprise-ui && npm install && npm start   # Angular staff app, http://localhost:4200
```

Each app needs its own `.env` (see `.env.example` and `server/.env.example`); `MONGODB_URI` is required for anything that saves data.

## Tests and checks

Run them one after another, not at the same time (they share an in-memory MongoDB):

```bash
npm test                                          # root: Next.js app
cd server && npm test                             # Express API + CMS (10 to 15 minutes)
cd enterprise-ui && npx ng test case-management --watch=false
npx tsc --noEmit && npm run lint                  # root types and lint
cd enterprise-ui && npx ng build case-management
```

CI (`.github/workflows/ci.yml`) runs all of these on every push. **Merging to `main` deploys to production** once CI is green
(`.github/workflows/deploy.yml`), so work on a branch.

## Where to read next

- **`AGENTS.md`** and **`CLAUDE.md`**: project rules and context for people and AI agents. Read `AGENTS.md` first.
- `docs/architecture/ADR-*.md`: why things are built the way they are (host separation, auth boundaries, case domain, Angular cutover).
- `docs/implementation/IMPLEMENTATION_STATUS.md` and `STABILIZATION_PHASE_01_REPORT.md`: what is built, what is deferred, known gaps.
- `DEPLOYMENT.md` and `docs/deployment/`: VPS setup, environment variables, backups, runbooks.
- `SECURITY.md`: security policy.

## Database operations

Migrations, index builds and retention purges are explicit commands that dry-run by default
(`npm run db:migrate`, `npm run db:indexes:dry-run`, `npm run db:purge`). Never apply them to production without a backup.
To create or recover a Super Admin when the password is lost, see `server/scripts/seedStaffUser.js`.

## Business rules that affect code and copy

No attorney or legal-advice language; no processing times, costs, approval rates or invented case studies; the site disclaimer is
never softened. Details are in `CLAUDE.md`.
