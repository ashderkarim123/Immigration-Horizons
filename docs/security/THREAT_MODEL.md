# Threat model

**Last reviewed:** 2026-09-03 (Cycle 10, ADR-012)

This document states what the platform defends against, which control does
the defending, and where the gaps are. It is written to be checked against
the code — every "how it is stopped" row names a real file, and most name a
test.

It is a *technical* threat model. It establishes no legal or regulatory
compliance position: data-processing, privacy, retention,
professional-responsibility and immigration-service obligations need review
by qualified legal and compliance personnel.

---

## 1. What is being protected

In rough order of harm if disclosed:

| Asset | Where it lives |
|---|---|
| Client identity and immigration documents (passports, degrees, employment records) | `case_documents` + private disk storage |
| Case history, internal review comments, employee-only channels | `case_activities`, `workspace_messages`, `workspace_channels` |
| Client and employee credentials | `client_users.passwordHash`, `adminusers.password` |
| Session and invitation tokens | `client_sessions`, `employee_sessions`, `portalinvitations` (hashed at rest) |
| Lead contact details | `consultations` |
| The audit trail itself | `security_events`, `document_access_logs`, `case_activities` |

## 2. Who the adversaries are

1. **An unauthenticated internet attacker.** Credential stuffing, forged
   requests, guessing identifiers, scraping.
2. **A signed-in client.** Legitimately authenticated, trying to reach
   another client's case, or internal staff material on their own case.
3. **A signed-in employee with a narrow role.** Legitimately
   authenticated, trying to reach cases they hold no membership on, or
   capabilities their role does not grant.
4. **A removed member.** Held access yesterday; must hold none today.
5. **A malicious file.** Uploaded content that executes somewhere.

Explicitly **out of scope**: a compromised host, a malicious database
administrator, and a malicious `super_admin`. Nothing in the application
layer defends against these; they are operational controls.

---

## 3. Scenarios and controls

Each row is a scenario from module 10's "Threat scenarios to test".

### A client guesses another case ID

**Stopped by** workspace membership, checked on every read.
`src/lib/auth/case-policy.ts` resolves a case only through the caller's own
membership row; there is no code path that takes a case id and returns a
case without one. "Not yours" and "does not exist" are the same 404.
*Tests:* `test/case-authorization.integration.test.ts`.

### An employee knows a document ID from another case

**Stopped by** `src/lib/auth/employee-case-policy.ts` and
`document-policy.ts`. Access is resolved from the document's workspace to
the employee's membership; a role holding `documents.view` without
`documents.view_all` sees only cases it is a member of.
*Tests:* `test/document-authorization.integration.test.ts`.

### A removed member reuses an old link

**Stopped by** membership being re-read on every request rather than
snapshotted into the session. Removing a member takes effect on their next
request. Employee deactivation additionally deletes the session row
outright (`employee-session.ts`), so it cannot be reused if the account is
later re-enabled.
*Tests:* `test/employee-auth.integration.test.ts`,
`test/case-authorization.integration.test.ts`.

### A client attempts internal channel access

**Stopped by** channel visibility being part of the query, not a filter
applied after loading. `collaboration-policy.ts` never returns an
`employees_only` channel to a client actor.
*Tests:* `test/collaboration-authorization.integration.test.ts`, plus the
leakage scan in `test/portal-experience.integration.test.ts` that asserts
no rendered portal HTML contains `/staff`, internal role codes, or
`internalReviewComment`.

### A forged MIME upload

**Stopped by** magic-byte validation, not the declared type.
`document-validation.ts` (mirrored in `server/services/documentValidation.js`)
requires the extension, the declared MIME type, and the *detected*
signature to agree, all against an allowlist. Storage keys are random,
files live outside the web root, and downloads are authorized and forced.
*Tests:* `server/test/document-validation.test.js`.

**Gap:** no malware scanning. `scanner.ts` is an integration point that
returns `not_configured` and never reports "clean".

### CSV formula injection

**Stopped by** `server/utils/csv.js`, which prefixes a quote to any cell
beginning `=`, `+`, `-`, `@`, tab or CR. Lead fields come from an anonymous
public form, so this is a real path.
*Tests:* `server/test/csv-cell.test.js`.

### Stored XSS in a message or profile field

**Stopped by** EJS and React escaping by default. No surface renders raw
HTML from user input; message bodies are plain text.
*Tests:* `server/test/search-xss.test.js`.

### Invitation token reuse

**Stopped by** single-use tokens: hashed at rest (SHA-256), consumed on
use, TTL-expired, and at most one active reset token per account.
Replaying a consumed reset token is refused *and* recorded as
`already_used`.
*Tests:* `test/portal-invitations.integration.test.ts`,
`test/security-audit.integration.test.ts`.

### Session fixation

**Stopped by** issuing a new session on every privilege change — the admin
CMS calls `session.regenerate()`, and both Next.js apps mint a fresh
DB-backed session on login and activation. Password reset destroys every
session for the account.
*Tests:* `server/test/integration/csrf.integration.test.js` (asserts the
pre-login token stops working after login).

### CSRF against document review or membership changes

**Stopped by** Origin verification on the Next.js apps
(`src/lib/auth/csrf.ts`) and synchroniser tokens in the admin CMS
(`server/middleware/csrf.js`). See ADR-012 §5 for why the two differ.
*Tests:* `server/test/integration/csrf.integration.test.js`, including an
enumeration over every mutating route the live router declares.

### Credential stuffing against an employee account

**Stopped by** per-account lockout (5 attempts, 15 minutes) on
`AdminUser`, enforced by *both* employee sign-in surfaces, plus IP rate
limiting. The two are not redundant: the limiter stops one host guessing
many passwords, the lockout stops many hosts guessing one password.
*Tests:* `test/security-audit.integration.test.ts` (including an explicit
IP-rotation case), `server/test/integration/security-audit.integration.test.js`.

### Account enumeration

**Stopped by** identical responses for unknown account, wrong password,
locked, deactivated, and no-role. Unknown accounts still pay a real bcrypt
comparison against a precomputed hash so response timing does not leak
existence. Password reset returns one message regardless.
*Tests:* `test/portal-auth.integration.test.ts`,
`test/security-audit.integration.test.ts`.

### Socket room join without membership

**Not applicable.** There is no realtime transport; Cycle 7 deferred it.
Messaging is request/response and goes through the same membership checks
as everything else. This scenario returns the moment sockets are added.

---

## 4. Known gaps

Carried openly rather than closed silently.

| Gap | Impact | Where recorded |
|---|---|---|
| No malware scanning on uploads | A malicious file can be stored and later downloaded by staff | ADR-004 §12, `CLAUDE.md` blocker 6 |
| Documents on local disk | Breaks on multi-instance or ephemeral hosting | `CLAUDE.md` blocker 2 |
| No 2FA on any surface | A stolen password is full access | ADR-012 "Not built" |
| Retention not automated | `security_events` grows unbounded | `DATA_RETENTION.md` |
| Append-only enforced in app layer only | A raw driver call can still rewrite audit rows | ADR-012 §1 |
| Indexes never run in production | Slow queries, and no unique constraints enforced | `CLAUDE.md` blocker 1 |
| Email never verified against real Resend | Reset and activation mail may silently fail | `CLAUDE.md` blocker 4 |
| `SITE_URL` unset in the checked-in `.env` | Every mutating portal and staff route 403s | `CLAUDE.md` blocker 5, `DEPLOYMENT.md` |
| `console.error` output not systematically scrubbed | Incidental detail may reach process logs | ADR-012 "Not built" |

## 5. Incident response

Minimal but real. Expand as the platform gains operators.

1. **Contain.** Deactivate the account in the admin CMS (`isActive:
   false`) — the SaaS app re-reads it on the next request and deletes the
   session row. For a client, set `status: 'disabled'`; the portal guard
   re-reads status on every request.
2. **Establish scope.** Query `security_events` by `subjectEmail`,
   `actorAdmin`/`actorClient`, or `ip` — all four are indexed.
   `document_access_logs` gives what was downloaded; `case_activities`
   gives what was changed.
3. **Revoke.** Deleting rows from `client_sessions` / `employee_sessions`
   invalidates immediately; there is no stateless token to wait out. A
   password reset revokes every session for the account.
4. **Preserve.** `security_events` cannot be edited or deleted through the
   application. Snapshot the collection before any purge.
5. **Review.** Every use of the break-glass env credential is recorded as
   `actorType: 'env_fallback'` and should be reconciled against a known
   operator.
