# ADR-033 — Instant portal access before email verification, thank-you pages and sign-up measurement

**Status:** Proposed, implemented on `feature/thank-you-pages-and-instant-portal-access`. Not merged, not deployed.
**Date:** 2026-10-27. **Extends:** ADR-001 (portal sessions), ADR-011, ADR-012 (security events), ADR-032 / Phase 16 (measurement).

## Context

Today a visitor who submits the consultation form gets **no account**. They get a single-use emailed invitation, and the account is created (password set, email marked verified, session issued) only when they open that link. Every portal page and API accepts a session only for an `active` account and fails closed otherwise.

The owner asked for three things:

1. a **thank-you page** after each website form submission;
2. a measurable **sign-up event** whenever someone signs up for the portal;
3. a visitor who signs up should be **signed in straight away without verifying their email**, with an alert that the email is not verified yet and a link to activate it.

Request 3 reverses the rule "no session without a verified email", so it is a security decision, recorded here.

## The threat that makes naive implementation unsafe

*Anyone can type anyone's email into the consultation form.* If submitting the form signed the submitter in to the account for that email, then:

- **Account takeover of an existing client.** An attacker types a real client's email and is signed in as that client. **This must never happen**, and the design makes it impossible: only an account **created by that very submission** can receive a session. An existing account of any kind never does.
- **Pre-hijacking.** An attacker signs up with a victim's email, keeps the session, and waits. When the victim later activates, the attacker's old session would now belong to a verified account holding the victim's cases and documents. The design **revokes every existing session when the account is verified**, and the unverified session can see nothing worth stealing meanwhile.
- **Information leaks through staff replies.** An unverified holder must not see anything staff wrote about the email's real owner.

## Decision

### 1. An unverified account exists, and its session is deliberately powerless

- A submission whose email has **no** account creates a `ClientUser` with `status: "pending"`, no password and `emailVerifiedAt: null`, and the normal emailed activation link is still sent.
- A session may be issued for that new account only. Existing accounts, including `pending` ones created by staff, never get one.
- **No existing guard changes.** `getSessionActor`, `requireClient` and every portal API accept only `active` accounts, so an unverified session is rejected by all of them by default. The only things that accept it are explicitly opted in: the `/portal` welcome screen, the resend-link API and sign-out.
- The welcome screen shows only that the request was received, the alert that the email is not verified, a **resend activation email** button, and a list of what unlocks after activation. It shows no consultation records, no staff content, no cases, no documents and no messages.
- Any other portal page, visited by an unverified session, redirects to the welcome screen.

### 2. Verification revokes all earlier sessions

The activation route now adopts an unverified, passwordless account (previously it refused: "an account already exists"), sets the password, marks the email verified, activates invited case memberships (as today), **deletes every existing session for that account**, and issues a fresh one. This is the pre-hijacking defence, and it has a regression test.

### 3. Handing the session from the marketing host to the portal host

The form is submitted on `immigrationhorizons.com` and the portal lives on `app.immigrationhorizons.com`. Cookies are host-only by design (no parent-domain cookies), so a cookie set by the form's action would never reach the portal.

- The action stores the new session token in a short-lived (10 min) `httpOnly` cookie scoped to the thank-you path on the marketing host.
- The thank-you page renders a small **POST form** to `/portal/welcome` containing the token. A POST keeps the token out of every URL, so it never reaches analytics, server logs or the `Referer` header. A GET link would also be consumed by link prefetchers.
- `/portal/welcome` accepts the request only from the portal's own origin or the public site's origin, validates that the token is a live **unverified** session, sets the portal cookie, and redirects to `/portal`.

### 4. Thank-you pages and measurement

- `/contact/thank-you` and `/consultation/thank-you` are `noindex`, excluded from the sitemap, contain no personal data and no query-string state, and are reached by the form navigating there after the server accepts the enquiry.
- `generate_lead` still fires once on acceptance, before navigation (Phase 16). New: `thank_you_view` (form name) on the thank-you pages, and the GA4 recommended **`sign_up`** (`method: consultation_form`) when the submission created a portal account.
- The portal stays untagged (Phase 16 privacy rule). Portal *activation* is therefore not a GA4 event; it is already recorded as the `activation_completed` security event and is visible to staff.

## Consequences and accepted trade-offs

- **Whether an email is new is visible to the submitter.** A new email gets the "Continue to your portal" session; an existing client does not. The previous behaviour already leaked this through a different redirect, and the requested feature cannot hide it. The thank-you page is identical for both outcomes except for what the button does.
- **Unverified accounts accumulate.** Each new-email submission creates a pending account, and spam submissions create junk rows (they already create junk leads). A retention job for pending accounts older than the invitation lifetime is a recommended follow-up, not built here.
- **Staff client lists show pending accounts** for people who submitted but have not activated. This is accurate.
- No schema or enum change: `pending` already exists and is shared with the Express mirror. The one new collection is none; the session token is reused. No index is added, so no production index operation is required.

## Rollback

Revert the branch. Pending accounts left behind are inert (they have no password and cannot sign in), and the activation route of the previous release refuses them with the existing message, so nothing becomes unsafe.
