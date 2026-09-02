# ADR-011 — Client Portal Experience Layer

**Status:** Accepted
**Date:** 2026-08-29
**Cycle:** 9 — client portal experience

## Context

Every client-facing *capability* already existed by the end of Cycle 8C:
dashboard, cases, messages, documents, queries, and notifications all
work, are policy-guarded, and are tested. What did not exist was the layer
that makes them feel like one product.

An audit before starting found five concrete gaps:

1. **The dashboard duplicated the shell.** It rendered its own
   notification bell (with its own unread count) and its own sign-out
   button, both of which the `AppShell` from ADR-009 §6 already provided
   on every page. Two bells, two counts, one of them present on exactly
   one screen.
2. **`/portal/profile` and `/portal/security` did not exist.** A client
   could not correct their own name, change their password while signed
   in, or see what devices were logged into their account. The only
   password path was the signed-out email reset.
3. **Page chrome was hand-rolled per page.** Three different vertical
   rhythms, breadcrumbs on 8 of 11 signed-in screens, and four distinct
   hand-written empty states.
4. **No portal `loading.tsx` or `error.tsx`.** The staff area got both in
   Cycle 8B; the portal fell through to the global boundary.
5. **Private pages carried no cache directive** beyond Next's defaults.

## Decisions

### 1. One shell owns identity, notifications, and account navigation

The notification bell is now an icon in `AppShell` with the unread count
as a badge, and it is the **only** entry point — `/portal/notifications`
was removed from the primary nav so a client is never given two unread
counts to reconcile. The dashboard's private copies of the bell and the
sign-out button were deleted rather than restyled.

`AccountMenu` gained a `links` prop. Profile, Security, and Notification
preferences live there rather than in the primary nav, which stays the
four places a client actually works (Dashboard, Cases, Consultations,
Questions).

**Client navigation is a constant with no `capability` field at all.**
`CLIENT_NAV` and `CLIENT_ACCOUNT_NAV` cannot be capability-filtered
because there is nothing to filter on — clients hold no capabilities. That
is enforced by test, along with the assertion that no client destination
starts with `/staff` or `/admin` and no staff destination starts with
`/portal`.

**Documents and messages are deliberately absent from the nav.** Both are
case-scoped (`/portal/cases/:id/documents`), and no cross-case index
exists. A top-level entry would be a dead end, so the module document's
flat nav list is not followed literally here.

The mobile menu closes on link click rather than via a `useEffect` on
`pathname`. Same behaviour, no cascading render — and the React compiler
lint rule that forbids the effect form is a good rule.

### 2. Shared layout primitives, promoted out of `staff/`

`Panel`, `PanelLink`, `EmptyState`, `RowList`, `Row`, and `DefinitionList`
moved from `components/staff/` to `components/app/`, along with `Badge`
and its tone helpers. They were never staff-specific; they were simply
written there first, in Cycle 8C.

`RestrictedState` stayed behind in `components/staff/panel.tsx`. Its copy
names internal roles ("aren't part of your role"), and the one rule this
cycle must not break is that internal role vocabulary never reaches a
client surface. Keeping it in a staff-only module makes that structural
rather than remembered.

`EmptyState` gained `icon` and `action`. Every portal empty state now says
what will eventually appear and why it has not yet — "No active cases yet"
alone leaves a client wondering whether something is broken.

### 3. `PageHeader` is the one page header

Title, optional description, optional breadcrumbs, optional actions,
optional badge. Applied across all eleven signed-in portal screens, which
also normalised the container rhythm to `py-10 sm:py-14` (matching the
staff console).

Its breadcrumb markup is intentionally **not** the marketing site's
`components/service/breadcrumbs`. That component exists to be paired with
`breadcrumbSchema()` JSON-LD, and emitting structured data that describes
a client's private case URLs would be exactly wrong on a noindex surface.

### 4. Self-service account management

`src/lib/auth/client-account.ts` holds profile updates, password change,
and session listing/revocation. Everything is scoped by the caller's own
`clientUserId`, taken from the verified session and never from request
input — there is no "which client?" parameter to get wrong. A test posts a
body naming another account's `_id`, `email`, and `status`; none of them
take effect.

Four decisions inside it are worth recording:

- **Email is not editable.** It is the login identity, the key every
  invitation is issued against, and the notification address. Changing it
  safely needs a verify-new-keep-old flow that does not exist. The page
  says so in a sentence rather than showing a disabled field.
- **Password change requires the current password**, even though the
  session is already authenticated. An unattended open session must not be
  enough to lock the account's real owner out.
- **Password change revokes every *other* session and keeps the current
  one.** This differs deliberately from the reset flow, which revokes
  everything: a reset is the moment compromise is suspected and the user
  is absent, whereas here the user is present, and signing them out of the
  tab they are looking at is hostile without being safer.
- **The raw user-agent is never rendered.** `describeUserAgent` reduces it
  to "Chrome on Windows" — the only question the device list exists to
  answer is *do I recognise this?* A test asserts no `AppleWebKit`
  fragment reaches the page.

Session revocation is the one row-level-scoped operation here, because a
session id arrives from the page. Every lookup filters `{ _id, clientUser }`
together, so another account's session id returns the same 404 as a
nonexistent one.

### 5. `portal-api.ts` guards new mutating routes

The client-side counterpart of Cycle 8C's `staff-api.ts`: Origin, rate
limit, session, and a live account re-read, in a fixed order that cannot
be reassembled wrongly route by route. The live re-read matters —
disabling a client in the admin CMS takes effect on their next request.

Password change gets its **own** rate-limit bucket, separate from profile
updates: it accepts a credential guess, so it must not share a budget with
an endpoint that does not.

Routes written before this module (login, activate, documents, messages,
notifications) keep their inline equivalents. They are covered by their
own tests, and rewriting fifteen working routes was not this cycle's job.
This is the pattern for anything new.

### 6. Private cache headers at the host boundary

`src/proxy.ts` now stamps
`Cache-Control: private, no-store, max-age=0, must-revalidate` alongside
the existing `X-Robots-Tag` on everything `app.*` serves.

`no-store` rather than `private, max-age=0`: a client's case data must not
be written to disk by a shared-machine browser, and must never be held by
an intermediary. Applying it at the boundary covers pages, RSC payloads,
and API responses alike, instead of depending on every route remembering.
The matcher already excludes static assets, so no cacheable asset is
affected.

**This is defence in depth, not the authorization boundary.** As ADR-008
§"Host checks are routing" already states: deleting the proxy would leak
URLs across hosts, not data.

## Consequences

- The portal reads as one product: one header, one empty-state treatment,
  one bell, one account menu, one loading skeleton, one error boundary.
- Clients can manage their own name, password, and signed-in devices
  without contacting the practice — the support questions ADR-007 §"admin
  client operations" was built to answer become largely self-serve.
- `AppShell` and `AccountMenu` gained props but no new responsibility:
  they still never read a session or a capability, so neither can become
  an authorization surface.
- The staff console inherited the promoted primitives unchanged; its
  imports moved, its rendering did not.

## Not built this cycle

- **The dashboard's data was not expanded.** The module document lists
  outstanding document requests, documents needing replacement, recent
  messages, and client-visible deadlines as dashboard widgets. This cycle
  was explicitly the experience layer, not new dashboard queries, so the
  dashboard shows the same two panels it did before — restyled, not
  re-scoped.
- **No cross-case document or message index.** Both remain case-scoped.
- **Email change**, per §4.
- **Two-factor authentication.** The security page is the natural home for
  it and does not have it.
