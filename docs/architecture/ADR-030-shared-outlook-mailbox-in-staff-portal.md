# ADR-030 — Shared Outlook mailbox in the Staff portal

**Status:** Accepted and implemented  
**Date:** 2026-10-12  
**Branch:** `feature/outlook-mailbox`

## Context

Staff answer clients from `info@immigrationhorizons.com`, an Exchange Online mailbox sold through GoDaddy. They switch between
Outlook and the Staff portal to do it, and nothing ties an email to the case it is about.

The mailbox has multi-factor authentication on, so a plain username and password (SMTP or IMAP) cannot be used by a program.
The tenant does allow application registrations, which Microsoft's own API requires.

## Decision

The Staff portal gets a **Mail** section for the one shared mailbox, and cases get an **Emails** tab.

### Connection

- The server signs in to Microsoft **as an application** (OAuth client credentials) with an app registration holding two Microsoft
  Graph application permissions: `Mail.ReadWrite` and `Mail.Send`. No person's password is involved, so MFA on the mailbox is irrelevant.
- Four environment settings in the **server's** `.env` only: `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`,
  `MS_GRAPH_MAILBOX`. With any missing, Mail says it is not connected and nothing else changes. The secret is never stored in the
  database, returned by an API, shown in the Admin Console or logged.
- The code only ever addresses `MS_GRAPH_MAILBOX`. No request can name another mailbox.
- The client secret expires; when it does Mail stops until a new one is set. This is expected and is documented in `.env.example`.

### What is stored

One new collection, `mail_case_links`: message id, case, and a display snapshot (subject, sender, date) plus who linked it. **No message body,
recipient list or attachment is ever copied.** Messages are fetched from Microsoft when opened. Message ids are Microsoft's *immutable* ids,
so a link survives a message moving between folders.

### Authorization

- `mail.view` and `mail.send` are separate capabilities, both granted to `super_admin`, `admin`, `operations_admin` and `pm`. Specialists and
  reviewers have no mailbox access, and do not see the Emails tab.
- Linking a message to a case also needs `cases.view` and the employee's **own** access to that case (the same row rule as every case module).
  A case the employee cannot open is the same 404 as one that does not exist. A message's links to cases the employee is not on are counted, never named.
- The mailbox is shared, so everyone with `mail.view` reads the same inbox. This is a deliberate first version: per-employee mailboxes are out of scope.
- Every send is recorded as `mail_sent` and every link change as `mail_case_linked`, attributed to the employee, with **counts and ids only**
  (no address, subject or body). Sending is rate limited per employee (20/min; reads 120/min).

### Safety of what is received

Email is untrusted. The server sanitizes HTML bodies to a small allowlist (no script, style, form, image, inline CSS or event handler), opens links in a
new tab with `noopener noreferrer nofollow`, and drops remote images (tracking beacons). The browser sanitizes again when rendering. Attachments download only
as `application/octet-stream` with `Content-Disposition: attachment` and `nosniff`, never rendered, at most 25 MB, and only real file attachments.

### Sending

Plain text only, up to 20 recipients per list and 30 in total. A message is created as a draft and then sent, so the platform always knows its id (needed for linking)
and a draft that cannot be sent is deleted. Replies are created through Microsoft so the original is quoted and threading is preserved. A failed send is never
audited as sent, and a failure to *link* after a successful send does not turn a sent message into an error.

### Errors

Microsoft's responses are never passed through. They map to: not connected (503), busy (503), refused by Microsoft (502, "an administrator should check the
mailbox connection"), unreachable (502), not found (404), too large (413). The Microsoft error *code* (for example `invalid_client` for an expired secret) is logged so
the problem is diagnosable; the secret, tokens, addresses and message content are not.

### Admin Console

The Integrations page shows whether the mailbox is configured. Nothing else about it is exposed there.

## Not in this version

Search, folders and rules, sending attachments, HTML composition, drafts, per-employee mailboxes, automatic matching of emails to clients, and webhooks/push
(the page reads on load). Mail also does not appear in global search, to avoid indexing message content.

## Operational notes

- The app registration's two permissions apply to **every** mailbox in the organisation unless restricted. Restricting the app to `info@` with an Exchange
  application access policy is recommended and is an administrator task in Microsoft.
- Permissions that are not needed (for example `UserAuthMethod-Email.ReadWrite.All`) should be removed from the registration.
- Indexes: `mail_case_links` declares `{messageId, case}` (unique) and `{case, messageDate}`. They are registered in `createIndexes.js` and **not applied** by this change.

## Testing

A fake Microsoft (`server/test/helpers/fakeGraph.js`) implements token issue and the slice of Graph used, so no test touches the network. Server integration tests
cover capabilities, sanitization, downloads, validation, send/reply, links and case access, audit, error mapping and rate limits; Angular specs cover every screen
state; one browser journey reads, replies, links and checks a specialist cannot see Mail.
