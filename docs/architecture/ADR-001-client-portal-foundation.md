# ADR-001 — Client Portal & Shared Domain Foundation

**Status:** Accepted
**Date:** 2026-08-04
**Module:** `01_ARCHITECTURE_AND_SHARED_DOMAIN.md`, `02_CLIENT_AUTHENTICATION_AND_ONBOARDING.md` (Cycle 1)

## Context

The platform is adding a client-facing portal (activation, login, consultation
dashboard) on top of two existing, separately-deployed applications: the
Next.js public site (repo root) and the Express/EJS admin CMS (`server/`).
Cycle 1 needs a small set of durable decisions before any portal code is
written, so later cycles (cases, documents, chat, real-time) don't have to
re-litigate them.

## Decisions

### 1. Portal hosting: Next.js, under `/portal/*`

The client portal is implemented entirely inside the root Next.js
application, under `src/app/portal/**` (pages) and
`src/app/api/portal/**` (route handlers). The Express admin app is untouched
and gains no client-facing routes.

**Why:** the plan's own non-negotiable rules keep the two applications
separate; clients are not admin employees and must never share the admin's
session store, auth middleware, or capability system. The Next.js app
already owns the public-facing consultation form and the `Consultation`
model, so client onboarding is a natural extension of code that already
exists there, not a new integration surface.

### 2. API boundary: Next.js Route Handlers, not Server Actions

State-changing portal operations (login, logout, activate, forgot/reset
password) are implemented as `app/api/portal/**/route.ts` handlers (plain
`Request` → `Response`), not React Server Actions.

**Why:**
- Server Actions are invoked through an internal, versioned RSC protocol
  that isn't a stable, directly-testable HTTP contract — Route Handlers are
  plain functions that take a `Request` and return a `Response`, so
  `12_TESTING_QA_AND_ACCEPTANCE.md`'s requirement for real HTTP-shaped
  integration tests can be satisfied by importing the handler module
  directly and constructing a `Request`, without booting a server.
- Auth flows need precise control over cookies, status codes, and redirect
  targets — a Route Handler expresses that directly.
- The existing consultation/contact forms keep using Server Actions
  unchanged (`src/app/consultation/actions.ts`,
  `src/app/contact/actions.ts`) — only the new invitation-creation step is
  added to that existing flow, not a rewrite of it.

### 3. Sessions: DB-backed opaque token in an HttpOnly cookie

Next.js has no built-in server-side session store (unlike the admin's
`express-session` + `connect-mongo`). The portal uses a dedicated
`ClientSession` collection: on login/activation a cryptographically random
token is generated, its SHA-256 hash is stored server-side, and the raw
token is set as an `HttpOnly`, `Secure` (in production), `SameSite=Lax`
cookie (`ih_portal_session`). Every request re-derives the session by
hashing the cookie value and looking it up — the raw token never touches
the database.

Session records carry `clientUserId`, `createdAt`, `lastSeenAt`,
`expiresAt` (absolute timeout), and an `idleExpiresAt` recomputed on each
authenticated request (idle timeout). Logout and password reset delete the
session record (or all sessions for that client, for reset), so revocation
is immediate rather than waiting for cookie expiry.

**Why:** matches the admin's own pattern (session id decoupled from a
public identifier, store-backed so multi-instance deployment works),
without pulling `express-session` into a framework it wasn't designed for.
A DB-backed session (vs. a signed JWT cookie) makes "logout invalidates
session" and "reset invalidates all sessions" trivial and immediate, which
a stateless JWT cannot do without a separate revocation list anyway.

### 4. CSRF strategy: Origin verification + SameSite=Lax

Every mutating portal route handler calls a shared `verifyOrigin(request)`
helper that rejects the request (403) unless the `Origin` header (falling
back to `Referer`) matches the deployment's own origin. This runs in
addition to, not instead of, `SameSite=Lax` cookies, which already stop the
cookie from being attached to a cross-site `POST`.

**Why:** `02_CLIENT_AUTHENTICATION_AND_ONBOARDING.md` requires CSRF
protection "before production" for the portal — stronger than the admin's
currently-deferred posture (`SECURITY.md`: admin CSRF is a known, deferred
gap). Since this is new code, not existing debt, it ships with protection
from the start rather than inheriting the admin's deferral. Origin
verification needs no session-bound token/state and no new dependency,
which keeps the surface simple while still covering browsers/proxies where
`SameSite` alone is not trusted as sufficient.

### 5. Error-response conventions

Portal API routes return `{ "error": { "code": string, "message": string } }`
on failure, using: `400` (validation), `401` (not authenticated), `403`
(authenticated but not authorized), `404` (not found — used identically for
"doesn't exist" and "exists but you can't see it," so existence is never
leaked), `409` (conflict, e.g. re-activating an already-active account),
`422` (semantically invalid input), `429` (rate limited). Auth failure
messages are deliberately generic ("Invalid email or password," "If an
account exists, a reset link has been sent") to prevent account
enumeration, per the plan's non-negotiable rules.

### 6. Actor identity types

`src/lib/auth/actors.ts` defines the discriminated union described in the
architecture module:

```ts
type ClientActor   = { type: "client"; clientUserId: string };
type EmployeeActor = { type: "employee"; adminUserId: string; role: string };
type SystemActor   = { type: "system"; service: string };
```

Only `ClientActor` is populated by real code in this cycle (from the
portal session). `EmployeeActor`/`SystemActor` are typed now so Cycle 2's
case/workspace authorization (which spans both a client and an employee
acting on the same record) has a stable shape to target, without pulling
the Express admin session into this app. Never infer an actor's type from
a route name or role string alone — always construct it from a verified
session lookup.

### 7. Database connection ownership

Unchanged: `src/lib/db.ts`'s `getDb()` remains the single connection point
for the Next.js app, shared with the legacy site and `server/` via the same
`MONGODB_URI`/`consultations` collection. New models (`ClientUser`,
`PortalInvitation`, `PasswordResetToken`, `ClientSession`) register against
the same connection, guarded the same way against Next.js dev-mode
hot-reload re-registration (`mongoose.models.X || mongoose.model(...)`).

### 8. Test application bootstrapping

Node 24's native TypeScript support (`node --test`, unflagged type
stripping) runs `.ts` test files directly — no new test-runner dependency.
Route handler modules are imported directly and invoked with a real
`Request`; session cookies are threaded between calls by reading `Set-Cookie`
from one `Response` and passing it as `Cookie` on the next request, the
same "real handler, real HTTP shape" approach `server/`'s `supertest`-based
tests use for the admin. Test database isolation reuses the same guarded
pattern as `server/test/helpers/testDb.js` (refuse anything that looks like
a managed/production URI; prefer `mongodb-memory-server`; never read
`MONGODB_URI`).

One prerequisite fix: `src/lib/db.ts` and `src/lib/models/Consultation.ts`
import the bare specifier `"server-only"`, which Next.js aliases internally
during its own build/dev pipeline but which was never an explicit
`package.json` dependency — so it did not resolve under plain Node (as used
by tests, or any other tool outside Next's bundler). Added as a real,
explicit dependency (Vercel's published `server-only` package) so these
modules are importable both by Next.js and by the test runner.

### 9. Future private file access (forward-looking, not built yet)

Documents (Cycle 4) will be served through an authorized download Route
Handler that streams from private storage after a record-level check —
never a public static URL. Recorded here only so this cycle's session/actor
shape doesn't block it.

### 10. Future real-time connection authentication (forward-looking, not built yet)

When Socket.IO (or equivalent) is introduced (Cycle 6/7), its handshake
will re-validate the same `ClientSession` cookie used by HTTP requests
(hash-and-look-up, identical to the HTTP path) rather than inventing a
second credential — recorded here so the session design doesn't need to
change later.

## Consequences

- The Next.js app gains its first real server-side mutable state (sessions,
  invitations) beyond the existing lead-capture write path — `MONGODB_URI`
  becomes load-bearing for the portal, not just "nice to have" as it is
  today for lead persistence.
- The Next.js app gains its first test suite. `package.json` gets a `test`
  script; CI/local dev now has a real command to run beyond `lint`/`build`.
- No changes to the Express admin app's routes, session store, or
  authorization model.
