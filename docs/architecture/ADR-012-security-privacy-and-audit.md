# ADR-012 — Security, privacy, and audit

**Status:** Accepted · **Cycle:** 10 · **Date:** 2026-09-03

Supersedes nothing. Amends ADR-009 §3 (the SaaS app now writes two fields
on `AdminUser`) and closes deployment blocker #3 from `CLAUDE.md` (the
admin CMS had no CSRF tokens).

## Context

Nine cycles built authentication, row-level authorization, private
document storage, and three separate application surfaces. Auditing them
found the controls in far better shape than the module document assumes —
bcrypt, generic login errors, constant-time comparison for unknown
accounts, session rotation, idle and absolute expiry, live re-reads of
account status, capability checks, membership scoping, 404-not-403,
Origin-verified mutations on both Next.js applications, MIME + magic-byte
validation, checksums, and per-document access logging were all already
present and tested.

Four gaps were not.

1. **Nothing recorded who authenticated.** `CaseActivity` covers case
   history and `DocumentAccessLog` covers downloads, but no log anywhere
   answered "who signed in, who was refused, and what changed about an
   account". Cycle 9 flagged this in its own handoff notes.
2. **The lockout was on the wrong actor.** The client portal counted
   failed attempts per account and locked at five. Both employee sign-in
   surfaces — the SaaS staff app and the admin CMS — had only IP rate
   limiting. An attacker rotating source addresses could guess an
   *employee* password indefinitely: the weaker control was on the
   higher-privilege actor.
3. **The admin CMS had no CSRF tokens at all**, relying entirely on
   `sameSite: 'lax'`.
4. **No threat model and no retention policy existed** to say what the
   system defends against or how long it keeps personal data.

## Decisions

### 1. One append-only `security_events` collection, written by both applications

`src/lib/models/SecurityEvent.ts` and `server/models/SecurityEvent.js` are
a mirror pair over the `security_events` collection, asserted against
`docs/architecture/security-event-contract.json` from both sides like
every other cross-app model since ADR-002.

Both applications write it. The alternative — a log per application —
was rejected because the first question of any incident is "what else did
this actor do", and an operator should not have to know which of three
surfaces an attacker chose before they can answer it. A `surface` field
(`portal` / `staff` / `admin_cms`) preserves that distinction inside one
timeline.

**Scope is deliberately narrow.** This log covers authentication, account
changes, and refusals. It does not duplicate `CaseActivity` (case
history) or `DocumentAccessLog` (document reads), both of which already
exist, are already append-only, and are already written by both apps.
Eleven event types, not a general-purpose event bus.

**Append-only is enforced, not documented.** `updateOne`, `updateMany`,
`findOneAndUpdate`, `replaceOne`, `deleteOne`, `deleteMany` and
`findOneAndDelete` all throw at the Mongoose layer, and `save()` throws on
a non-new document. This stops application code drifting into "just fix
that one row"; it is not a database permission and does not stop a raw
driver call. Restricting the application's Mongo role is deployment work,
noted in `docs/security/DATA_RETENTION.md`.

### 2. The recorder is fail-open, and cannot be handed a credential

`recordSecurityEvent` never throws and never rejects. An audit write
failing must not turn a working login into a 500.

This is a real trade-off, taken deliberately: a Mongo outage loses audit
entries rather than locking every user out of the platform. It mirrors the
decoupling the lead pipeline already uses (`CLAUDE.md`, "Lead delivery").
Failures are written to stderr so the gap is visible in process logs, and
a test asserts a simulated audit outage still yields a working login with
a session cookie.

`meta` is filtered against a denylist (`password`, `token`, `tokenHash`,
`secret`, `cookie`, …) before it is written, values are truncated at 500
characters, and **nested objects are dropped rather than walked** — a
one-level scan cannot police a nested payload, so nesting is refused
outright. Call sites are already careful; this exists so a future careless
one drops a field instead of writing a password into a collection
operators query freely. A test drives real logins, password changes and
resets, then asserts none of the actual secrets used appears anywhere in
the resulting log.

**`subjectEmail` is stored on purpose**, including for failures against
accounts that do not exist. Without it the log cannot answer "which
account was being attacked", which is the first question of a
credential-stuffing investigation. It is an identifier, not a credential.
Its retention is covered in `docs/security/DATA_RETENTION.md`.

### 3. Lockout moves onto the account, and both employee surfaces enforce it

`AdminUser` gains `failedLoginCount`, `lockedUntil`, and `lastLoginAt` —
the same three fields `ClientUser` already had. Five failures locks the
account for fifteen minutes; the thresholds live in
`src/lib/auth/lockout.ts` and `server/utils/lockout.js` and are asserted
against the shared contract from both sides.

**This makes the SaaS app a writer to `AdminUser`, which ADR-009 §3 said
it would not be.** The exception is narrow and unavoidable: both
applications authenticate the same records, so a lockout only one of them
enforces is not a lockout — an attacker locked out at `app.*` simply
continues at `admin.*`. The SaaS app writes those two counter fields and
nothing else; credentials, role, and `isActive` remain owned exclusively
by the CMS.

Counters are written with `updateOne({ $set })`, never `document.save()`.
Saving re-validates the whole document, so a single legacy row with a role
outside the schema enum would stop being able to log in at all — this was
caught by an existing fail-closed test, and is now covered by its own
regression test. `updateOne` also cannot re-run the CMS's bcrypt
`pre('save')` hook over an already-hashed password.

Two details worth stating because they are easy to get backwards:

- **The counter resets when the lock is applied**, so the lock is a delay
  rather than a state an attacker can hold an account in indefinitely by
  continuing to guess.
- **A correct password against a deactivated account does not consume the
  budget.** The credential was right; counting it as a guess would let a
  deactivated user lock out a login that may later be reactivated.

A locked account returns exactly the same generic error as a wrong
password. That an account is locked is not something an unauthenticated
caller may learn.

### 4. Refusals are recorded at the guard, not at the route

`guardStaffRequest` records `permission_denied` when a capability check
fails, and `requireCaseAccess` records it when row-level scope fails.

This is the point of having a single guard. The caller gets 404 — the
existence of a resource is itself information, per ADR-010 §9 — which
means the refusal is invisible to them by design. It must not also be
invisible to the operator. An employee walking case ids they hold no
membership on produces a run of these against one actor, which is exactly
the signal worth having.

### 5. The admin CMS gets synchroniser tokens; the Next.js apps keep Origin checks

Two mechanisms, chosen per application because the request shapes
genuinely differ. This is not an inconsistency to reconcile later:

- The Next.js applications issue every mutating request as a `fetch` from
  their own JavaScript, which always carries an `Origin` header.
  `verifyOrigin` is sufficient and needs no per-form plumbing.
- The admin CMS posts real HTML forms, where `Origin` is not reliably
  present across the browsers and redirect chains an admin works in. It
  needs a token the form itself carries.

The token lives in the express session, is issued to every rendered view
as `res.locals.csrfToken`, and is carried by all 75 POST forms. The ten GET
filter/search forms deliberately do not carry it — they change nothing, and
adding it would put the token into the query string of every filter link.
`session.regenerate()` on login rotates the token as a side effect, so one
harvested from the login page cannot be replayed against an authenticated
session.

**What is verified:** any authenticated state-changing request, plus
`POST /admin/login` (login CSRF — forcing a victim into an attacker's
session — is a real attack, and the login form is the one mutating route
outside `requireAdmin`).

**What is not:** an unauthenticated request to any other route. It cannot
change anything, because every other `/admin/*` route sits behind
`requireAdmin`, which redirects it to the login page. Rejecting it here
would replace that redirect with a dead-end 403 for the ordinary case of
an admin whose session expired while a form was open.

**The ordering constraint is the interesting part.** The token arrives in
`req.body._csrf`, so verification must run *after* a body parser. For
urlencoded forms that is the global `express.urlencoded`. For
`multipart/form-data` the parser is multer, mounted per route — so those
requests are deferred by the global middleware and verified afterwards by
`verifyCsrf`. `middleware/upload.js` exposes `uploadSingle(field)`, which
composes multer and the verifier, so a route cannot acquire file uploads
without also acquiring verification.

Because that composition is a convention rather than a type, it is backed
by a test that walks the live Express router and asserts **every** mutating
route refuses a tokenless request. That test, not the convention, is what
catches a route added later that escapes both paths.

One accepted limitation: with disk-backed multer, a forged multipart
request writes its temp file before verification rejects it. The file is
never registered against a case and is swept by the existing storage
reconciliation, so the exposure is disk churn, not data.

## Consequences

- Every authentication and refusal across three surfaces is now
  attributable, with actor, subject, IP, user agent, result, and
  structured metadata, in one timeline.
- Employee accounts have the same brute-force protection client accounts
  had, and it survives IP rotation.
- Every state-changing admin form is CSRF-protected; deployment blocker #3
  is closed.
- The SaaS app now writes two fields on a model it previously only read.
  That narrowing is documented above and enforced by the fact that the
  only write is `$set` of the lockout patch.
- `security_events` grows on every login. Retention is defined in
  `docs/security/DATA_RETENTION.md` (400 days) but **not yet automated** —
  see "Not built".

## Not built this cycle

- **No automated retention purge.** The period is defined and indexed for;
  the deletion job is not written. A TTL index was deliberately not added:
  an audit log that silently deletes itself is worse than one that grows,
  and the purge should be a reviewed operation.
- **No 2FA** on any surface.
- **No malware scanning.** `scanner.ts` / `scanner.js` remain the
  documented integration point returning `not_configured`, which never
  reports "clean".
- **No admin UI for the log.** It is queried directly during an incident.
  A read-only viewer gated on a new capability is the obvious next step.
- **No database-level restriction** on the `security_events` collection —
  append-only is enforced in the application layer only.
- **Log redaction beyond `meta`.** Application `console.error` output is
  not systematically scrubbed; the audit log is.
