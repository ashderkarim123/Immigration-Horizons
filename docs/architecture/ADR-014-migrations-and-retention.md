# ADR-014 — Migrations, indexes, and retention

**Status:** Accepted · **Cycle:** 11 · **Date:** 2026-09-04

Implements the purge job ADR-012 deferred, and adds the migration tooling
the platform has gone eleven cycles without.

## Context

Eleven cycles added sixteen collections and changed the shape of two
existing ones, and there has never been a migration. That worked because
every change was additive and the data was thin — but two of those changes
left records stranded in a state no query reaches any more, and nothing
existed to find or fix them.

Auditing module 11's proposed backfills against the code found two real and
two that describe work already done:

| Module 11 asks for | Reality |
|---|---|
| Normalize existing consultation emails | Not needed as a destructive rewrite — matching normalises at read time instead (see §2) |
| Link consultations to existing client accounts | **Real gap.** `Consultation.clientUser` is written in exactly one place |
| Add missing display snapshots | Already done — `actorSnapshot.js` has captured these since Cycle 2 |
| Convert legacy notification recipient names to immutable IDs | **Real gap.** Pre-Cycle-7 rows are invisible to every current query |

The index script from earlier cycles already satisfied most of module 11's
"index deployment script" requirements — dry run, refuses a placeholder URI,
`createIndexes()` only, never drops, logs before/after counts. It needed the
new `security_events` collection registered and nothing else.

## Decisions

### 1. One `run({ dryRun })` per migration, not a plan/apply pair

A migration exposes a single function and takes a flag. The dry run and the
real run execute the same code down to the last branch; only the final write
is skipped.

The alternative — a `plan()` that describes and an `apply()` that acts — is
two implementations of one rule, and they drift. A dry run that is a separate
reimplementation is a dry run that lies, which is worse than no dry run at
all because it is trusted.

### 2. Migrations refuse to guess, and say so loudly

Both migrations resolve records by matching on a weak key: a display name in
one case, an email address in the other. Both can be ambiguous.

When they are, the record is **left exactly as it was**, counted under a
named reason, and sampled in the output. Module 11's acceptance criteria
require that no migration silently discards unresolved data; the stronger
reason is that a wrong answer here is a data-exposure bug, not an untidy row:

- `001` attaching a notification to the wrong employee shows them a case
  they were never a member of.
- `002` linking a consultation to the wrong client puts one person's
  immigration enquiry in another person's portal.

So `002` links only where the address resolves to exactly one **active**
client account. Activation is the only proof the platform has that a person
controls an inbox, which makes "active" the whole of "verified matching
rules". A `pending` account has proven nothing and is not enough.

This is also why module 11's "normalize existing consultation emails" is not
implemented as a rewrite of stored data. `Consultation.email` is what the
visitor typed, and overwriting it destroys the only record of that. `002`
normalises on both sides at comparison time instead, which achieves the
matching goal without touching submitted data.

### 3. The retention purge is a reviewed script, never a TTL index

`security_events` still has no TTL index, and this ADR does not add one.

An audit log that deletes itself on a schedule is worse than one that grows:
the deletion is invisible, unreviewable, and happens precisely when an
investigation might want the oldest record. Module 11 says the same thing
directly — "do not implement automatic deletion until policy is approved".

So `npm run db:purge` is a manual operation that counts before it deletes,
defaults to a dry run, and enforces the 400-day period from
`docs/security/DATA_RETENTION.md` as a **floor**: passing
`--older-than-days 30` is refused, because shortening the audit window is the
one operation here that destroys evidence rather than tidying it. Changing
the period means changing the policy document and the contract fixture, not
an invocation.

**The purge goes through the raw driver collection, deliberately.** The
`SecurityEvent` model refuses deletes (ADR-012 §1) and that guard must stay —
it exists to stop application code quietly rewriting history. A purge is the
one legitimate exception, so it sits below the model layer where the intent
is explicit and cannot be triggered by accident from a route handler.

### 4. Dry run is the default; production needs a second flag

Both `db:migrate` and `db:purge` write nothing unless given `--apply`. A
runner that writes unless told otherwise gets run by accident exactly once,
and that once is enough.

`--apply` against a URI that looks like a managed or production database
additionally requires `--i-have-a-backup`. Module 11 asks for a backup before
production changes; a flag is the only place that can actually be enforced,
and it makes the operator state the claim rather than assume it. The
production heuristics are the same patterns the test-database guard uses, for
the opposite purpose: there to refuse to run, here to demand confirmation.

Credentials are redacted from every line the scripts print.

### 5. Idempotency is the recovery procedure

Each migration selects only documents not already in the target state, so a
second pass reports zero changes. That is asserted directly in the tests, and
it is what makes a partially-failed run safe: the answer to a migration that
died halfway is to run it again, not to restore a backup. The runner's error
handler says so, because the instinct in the moment is the opposite.

`002` additionally re-asserts `clientUser: null` in its update filter, so a
migration running while someone activates their account cannot overwrite the
link activation just made — whichever writes first wins and the other is a
no-op.

## Consequences

- Legacy notifications become visible to their recipients again.
- Clients see every consultation they submitted, not only the one their
  invitation named.
- `security_events` has a defined, enforceable retention operation, closing
  deployment blocker #7.
- The migration pattern exists for future cycles: add a file to
  `scripts/migrations/`, register it in `scripts/migrate.ts`.
- Ambiguous records persist by design. Some deployments will carry a handful
  of unresolved rows forever, and that is the correct outcome — the reports
  name them so an operator can resolve them by hand if it matters.

## Not built

- **No migration ledger.** Nothing records that a migration has run;
  idempotency is what makes re-running safe instead. A ledger becomes worth
  building when a migration cannot be made idempotent, and none here is.
- **No scheduled purge.** `db:purge` is manual on purpose (§3). Wiring it to
  cron is a deployment decision, and the deployment guide covers it.
- **No down migrations.** Both changes are additive fills of empty fields;
  the inverse is `$unset`, which throws away the only thing the migration
  produced. A destructive migration would need one — none here is.
- **The indexes still have not been run in production** (blocker #1). This
  cycle registered `security_events` and verified the dry run; executing it
  against the live database remains a deployment step, not a code change.
