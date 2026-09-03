# ADR-013 — One pluggable mail transport per application

**Status:** Accepted · **Date:** 2026-09-04

Reverses `CLAUDE.md`'s "Resend only, do not add fallback SMTP" rule, at the
owner's explicit instruction. Closes the code half of deployment blocker #4.

## Context

Two problems, one cause.

**The duplication.** Seven call sites — `src/lib/leads.ts`,
`src/lib/auth/email.ts`, and five `server/services/*Email.js` — each carried
their own copy of the same twenty lines: construct a Resend client, resolve
`EMAIL_FROM`, send, branch on the error, log, return false. Each was written
by copying the last one, and each cycle since Cycle 2 added another. Changing
anything about how mail sends meant changing it seven times, and the five
server copies had drifted into five separate `_setMailerForTests` hooks that
tests had to install individually.

**The provider.** `CLAUDE.md` recorded Resend as a deliberate choice and
warned against "fixing" the silent-failure behaviour by adding fallback SMTP.
That rule stands on its merits, but it assumed Resend would be the deployment
provider. The owner is migrating to a VPS and wants SMTP, which is a
configuration decision the code had hard-coded.

Underneath both: **deployment blocker #4** — every mail adapter across nine
cycles had been tested against doubles of our own construction. Nothing had
ever spoken SMTP, or anything else, to a real server.

## Decisions

### 1. One transport module per application, selected by configuration

`src/lib/email/transport.ts` and `server/services/mailer.js` are a mirror
pair. Every send in both applications goes through one of them. The seven
adapters keep their own copy composition and their own log tag — which is how
an operator still tells `[document-email]` from `[leads]` in production logs
— and nothing else.

`MAIL_TRANSPORT=resend|smtp` chooses. Omitted, the transport is inferred from
whichever credentials are present, so a deployment that only ever set
`RESEND_API_KEY` keeps working with no new configuration. Resend wins a tie
because it is what every previous cycle was written and tested against.

**An explicit transport with missing credentials resolves to `none`, never to
the other provider.** Silently sending through a provider the operator did
not choose is worse than not sending: it sends from the wrong domain, which
is both a deliverability failure and a trust problem on a client-facing
address.

### 2. The never-throws contract is preserved, deliberately

Every send returns a boolean and logs; none rejects. This is the one part of
the old behaviour that must not change: a failed notification must never roll
back the action that triggered it — a consultation submission, a password
reset request, a document review. `CLAUDE.md` records this as a documented
tradeoff rather than a bug, and it survives the move to a pluggable transport
unchanged.

The tests assert it directly: an unreachable host, a rejected login, and a
rejected message all return `false` rather than throwing out of an adapter.

### 3. SMTP uses a pooled transporter, and something must close it

Reconnecting and re-authenticating per message is what gets a sender
rate-limited, so one transporter is reused, keyed on the SMTP settings so a
configuration change rebuilds it. A send failure drops the pool rather than
retrying forever over a connection that is already broken.

The pool has a consequence that cost real debugging time and is worth
recording: **an open pooled socket keeps the Node event loop alive.** A
long-running server does not care — that is the point of a pool — but a
one-shot script hangs after printing its result. `closeMailTransport()`
exists for that, and `mail:check` calls it in a `finally`. The same property
made the first version of the SMTP tests take 20 seconds each: `net.Server.close()`
waits for open connections, and the test helper had to destroy its sockets
explicitly. The session itself takes 42ms.

### 4. `mail:check` is how blocker #4 actually closes

Both applications get `npm run mail:check`. It reports which transport
resolved and from what, verifies connectivity without sending, and with
`-- --send you@example.com` sends one real message.

It exists because "the adapter is tested" and "mail works in production" are
different claims, and only the second one matters at go-live. It must be run
**on the server, against the production `.env`**, for both applications
separately — they read the same variable names from different files.

It also warns when `SITE_URL` is unset even though mail is otherwise working,
because that combination sends successfully and delivers activation links
pointing at `localhost`.

### 5. SMTP is tested against a real SMTP server

`test/helpers/fakeSmtp.ts` and `server/test/helpers/fakeSmtp.js` are a
dependency-free SMTP server — roughly ninety lines of `node:net` implementing
enough of RFC 5321 for nodemailer to complete a session.

Stubbing `sendMail` would only prove our wrapper calls itself. These tests
exercise the real client: EHLO, AUTH, envelope, DATA, dot-stuffing,
termination. They assert the envelope, the `Subject`, the `Reply-To`, and the
body that actually reached the wire — and that `verifyTransport()` connects
without sending anything.

## Consequences

- Changing how mail sends is now one edit per application, not seven.
- The five per-service `_setMailerForTests` hooks are gone; three integration
  suites that installed them individually now use one seam on the mailer.
- SMTP is available without removing Resend, so the transport is a
  deployment decision rather than a code change.
- `nodemailer` is a new dependency in both applications. It is the only
  maintained SMTP client for Node and has no runtime dependencies that reach
  the browser bundle — both modules are server-only.
- **`CLAUDE.md`'s "do not add fallback SMTP" rule no longer applies** and has
  been rewritten. The silent-failure behaviour it was protecting is intact;
  only the provider lock-in is gone.

## Not built

- **No automatic failover between transports.** If the configured provider is
  down, mail fails and logs — it does not quietly try the other one. Failing
  over would send from a different domain mid-incident, which is exactly what
  decision 1 refuses.
- **No retry queue.** A failed send is lost, not queued. Every current
  message is a notification with a UI equivalent (the portal shows the
  document, the query, the case) so a lost email degrades rather than breaks.
  A queue becomes worth building when a message has no such fallback.
- **No bounce or complaint handling.** Neither provider's webhooks are wired.
- **No DKIM/SPF/DMARC verification in code.** `mail:check --send` proves a
  message was accepted; whether it reaches an inbox rather than spam depends
  on DNS records the deployment guide covers but the application cannot check.
