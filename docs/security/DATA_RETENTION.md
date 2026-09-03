# Data retention and privacy

**Last reviewed:** 2026-09-03 (Cycle 10, ADR-012)

What the platform stores, why, and for how long. Companion to
`THREAT_MODEL.md`.

**This is an engineering policy, not a legal one.** It records the
retention the software actually implements or intends. Whether those
periods satisfy any particular jurisdiction's requirements — or Immigration
Horizons' professional-responsibility obligations as a consulting and
paralegal practice — needs review by qualified legal and compliance
personnel. Where the two disagree, the legal position wins and this
document should be changed to match.

---

## 1. Retention periods

| Data | Collection | Period | Enforced how |
|---|---|---|---|
| Security/audit events | `security_events` | 400 days | **Not automated** — see §4 |
| Document access log | `document_access_logs` | Life of the case | Not purged |
| Case activity timeline | `case_activities` | Life of the case | Not purged; append-only |
| Client sessions | `client_sessions` | 14 days absolute / 2 hours idle | TTL index |
| Employee sessions | `employee_sessions` | 12 hours absolute / 2 hours idle | TTL index |
| Portal invitations | `portalinvitations` | 7 days | TTL index; single-use |
| Password reset tokens | `password_reset_tokens` | 1 hour | TTL index; single-use |
| Uploaded documents | disk + `case_documents` | Life of the case | Manual |
| Leads | `consultations` | Indefinite | Manual |

400 days for the audit log is chosen to cover a full year plus a review
cycle: it lets an investigation compare an incident against the same period
a year earlier, which a 90-day window cannot.

## 2. Data minimisation

What is deliberately **not** stored:

- **No plaintext credentials anywhere.** Client and employee passwords are
  bcrypt-hashed (cost 12). Session, invitation and reset tokens are stored
  as SHA-256 hashes — the raw token exists only in the cookie or the email.
- **No credential or token in the audit log.** `meta` is denylist-filtered
  before write, nested objects are dropped rather than walked, and a test
  drives real logins, password changes and resets then asserts none of the
  secrets used appears anywhere in the resulting log.
- **No document content in any log.** `document_access_logs` records that a
  download happened, never what was in the file.
- **No client-side analytics on any authenticated surface.** The SaaS app
  carries no third-party scripts; `proxy.ts` serves it `noindex` plus
  `Cache-Control: private, no-store`.
- **No raw user-agent shown to clients.** `describeUserAgent` reduces it to
  "Chrome on Windows" for the device list. The raw string *is* kept in
  `security_events`, where it is operator-only and needed for incident
  response.

### Why `subjectEmail` is stored on failed logins

An email address is written to `security_events` even when the account does
not exist. This is deliberate: without it the log cannot answer "which
account was being attacked", which is the first question of any
credential-stuffing investigation. It is an identifier, not a credential,
and it is covered by the 400-day period above.

## 3. Deletion and deactivation

**Available today:**

- **Client deactivation** — `status: 'disabled'` in the admin CMS revokes
  every session and refuses future logins. The account and its case history
  are retained.
- **Employee deactivation** — `isActive: false` deletes the SaaS session
  row and refuses future logins on both employee surfaces.
- **Case archiving** — removes a case from active queues without deleting
  it.

**Not available today:**

- **No client-initiated account deletion.** A client cannot erase
  themselves from the portal.
- **No cascading erasure workflow.** Removing a client would have to reach
  `consultations`, `client_cases`, `workspace_members`,
  `workspace_messages`, `case_documents`, disk storage, and the three audit
  logs — with a decision, per collection, about whether an audit trail
  should survive an erasure request. That decision is legal, not technical,
  which is why the workflow is not built speculatively.

Both are real gaps for any jurisdiction with an erasure right. They need a
legal position before an implementation.

## 4. Purging the audit log

`security_events` is append-only and **has no TTL index**. That is a
deliberate choice: an audit log that silently deletes itself is worse than
one that grows, and a purge should be a reviewed operation with a snapshot
taken first.

No purge job is written yet. Until one is:

- The collection grows on every login across all three surfaces. At a
  small practice's volume this is megabytes per year, not a capacity risk.
- When a purge is built, it must run as a distinct database role. The
  application's own model layer refuses deletes — that is the point — so a
  purge cannot and should not go through it.

## 5. Access to the audit log

There is no UI. `security_events` is queried directly during an incident,
indexed on `createdAt`, `type`, `subjectEmail`, `actorClient`, `actorAdmin`
and `ip`.

That is a deliberate stopping point rather than an oversight: a log viewer
is a surface that shows every account name and IP in the system, so it
needs its own capability, its own row-level rules, and its own audit
entries for who read it. That is a cycle's work, not a page.

## 6. Third parties

| Service | Data sent | Notes |
|---|---|---|
| Resend | Lead notifications, activation and reset emails | Contains client name, email, and enquiry text |
| MongoDB (self-hosted or managed) | Everything | See `DEPLOYMENT.md` for the topology |

No analytics, advertising, session-recording or error-reporting service
receives authenticated-surface data. Adding one would need a review against
§2 — particularly anything that captures DOM content, which on the portal
would capture case detail.
