# SECURITY.md

# Immigration Horizons Security Standards

Version: 1.0

---

# Purpose

Defines security standards — the actual current implementation, verified against `server/server.js`, `server/middleware/`, and `server/utils/permissions.js`, and the target model this is being built toward.

---

# Part 1 — Current Implementation

# Authentication (actual)

- Session-based: `express-session` + `connect-mongo` (persistent session store in MongoDB, not in-memory).
- Password hashing: **bcryptjs** (`bcrypt.genSalt(12)` in `server/models/admin/User.js`), **not Argon2**.
- No email verification, no self-service password reset flow implemented yet.
- Session cookies: `secure: true` only when `NODE_ENV=production`; `trust proxy` set to `1` only in production (required for `req.secure` to read correctly behind nginx's `X-Forwarded-Proto`).
- Startup guard: the server **refuses to start in production** if `SESSION_SECRET` or `ADMIN_PASSWORD` are left at documented placeholder values, or if `MONGODB_URI` is missing — see `server/server.js` and the repo's own `DEPLOYMENT.md` Part 3.
- Login is rate-limited: `express-rate-limit`, 10 attempts / 15 minutes on `/admin/login`.

# Authorization (actual)

Not full RBAC. Two layers:
1. `requireAdmin` (`server/middleware/auth.js`) — single boolean session gate (`req.session.isAdmin`) on most admin routes.
2. `blockReadOnly` / `requireManager` (`server/utils/permissions.js`) — a coarse two-tier check for the lead-ops module only: `MANAGER_ROLES = ['super_admin', 'admin', 'pm']` can assign/create/delete; `READ_ONLY_ROLES = ['viewer']` is blocked from all mutations. The other 8 roles on the `AdminUser.role` enum (`petition_writer`, `business_plan_specialist`, etc.) are not yet individually gated — they behave as full read-write users today.

Frontend never holds authorization logic that matters — all of the above is enforced server-side already, which is correct and should stay true as the permission model grows more granular.

# Input Validation (actual)

Mongoose schema validation (required fields, enums, types) on write. No Zod, no shared cross-route validation layer yet.

# Password Policy (actual)

No enforced minimum length or complexity rule on the current signup/user-creation form beyond what bcrypt requires structurally. `ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH` env-based fallback is explicitly guarded against known-bad defaults (`admin`, `admin123`, `admin123456`) at production startup — see `DEPLOYMENT.md`.

# Session Security (actual)

Session store is MongoDB via `connect-mongo` — no dedicated `Sessions` collection tracking device/browser/IP/last-activity per session, and no UI for a user to see or revoke their own active sessions.

# File Upload Security (actual)

`multer` validates on upload (blog cover images, testimonial photos, media library); files land on local disk (`server/public/uploads/`).

# API/Route Security (actual)

`helmet` is applied (`contentSecurityPolicy: false` — CSP itself is not currently configured, everything else helmet sets by default is active: `X-Content-Type-Options`, `X-Frame-Options`, etc.). `express-rate-limit` is applied to the login route specifically, not globally across the admin.

# CSRF (actual — a known, deliberate gap)

**No CSRF token protection on admin forms.** Mitigated by `sameSite: 'lax'` session cookies, not eliminated. This was explicitly scoped out of a prior hardening pass given the size of a full `csurf`-style rollout relative to that phase's "no new features" constraint — see the repo's own `DEPLOYMENT.md`. Don't treat this as an oversight to silently patch as a drive-by change; it's tracked, scoped future work (see Part 2).

# Database Security (actual)

No systematic soft-delete — some collections hard-delete (e.g. `Testimonial`, `FAQ` deletes via the admin routes). `ActivityLog` is append-only and per-lead only, not a platform-wide audit log (see `DATABASE.md` Part 1).

# Secrets (actual)

Environment variables only (`.env`, gitignored — confirmed via `git check-ignore`). No secrets committed to the repo.

# HTTPS (actual)

Enforced in production via nginx + Let's Encrypt/certbot per the repo's `DEPLOYMENT.md` — not something this app enforces itself in code beyond the `secure` cookie flag.

---

# Part 2 — Target Architecture

The following is where security is being built toward. None of it is implemented yet — treat each item as scoped future work, not a current requirement to retrofit opportunistically.

## Planned Authentication

- Email verification, self-service password reset.
- Two-Factor Authentication.
- Argon2 was mentioned in an earlier draft of this doc set — **bcrypt is the actual and intended hashing algorithm; do not migrate to Argon2** without an explicit, separate decision, since that's a real breaking change to every existing password hash, not a documentation correction.

## Planned Authorization

Full RBAC: a configurable `Roles` + `Permissions` collection pair (see `DATABASE.md` Part 2), replacing today's `MANAGER_ROLES`/`READ_ONLY_ROLES` split with per-module, per-role permissions (Leads, Clients, Cases, Petitions, Documents, Blog, SEO, Settings, Audit Logs, etc.) assignable without a code change.

## Planned Input Validation

Zod validation shared across the future API layer (see `API_ARCHITECTURE.md` Part 2), replacing/supplementing today's Mongoose-only validation.

## Planned Session Security

A real `Sessions` model tracking device/browser/IP/login time/last activity per session, with a UI for session revocation.

## Planned File Upload Security

MIME-type verification beyond extension/size checks, reject-executable enforcement, and migration to cloud storage (S3/Cloudinary) with proper access control — see `ARCHITECTURE.md` Part 2 and the local-disk-uploads gap already flagged in `DEPLOYMENT.md`.

## Planned API Security

Rate limiting extended beyond just the login route once a real API layer exists; consistent error responses that never leak internals (see `API_ARCHITECTURE.md` Part 2).

## Planned CSRF Protection

Full `csurf`-style (or equivalent) token protection across every admin form, closing the gap noted in Part 1. This is real, scoped work — size it properly rather than bundling it into an unrelated feature change.

## Planned Database Security

Systematic soft-deletes across all user-facing collections (not just some), least-privilege DB user credentials in every environment, and a platform-wide `AuditLogs` collection (see `DATABASE.md` Part 2) covering everything `ActivityLog` doesn't (blog publishing, settings changes, role changes, login/logout across the whole admin, not just lead activity).

## Planned Audit Logging Scope

Login, logout, CRUD operations, role changes, lead assignment, petition updates, blog publishing — today only lead-related events are logged (via `ActivityLog`); the rest of the admin has no audit trail yet.

---

# Success Criteria

The platform must protect user data, prevent unauthorized access, and maintain complete auditability. Today's implementation already gets the load-bearing pieces right (server-side session auth, rate-limited login, production startup guards against insecure defaults, gitignored secrets); the Part 2 items are the deliberate next steps, not corrections to what exists.
