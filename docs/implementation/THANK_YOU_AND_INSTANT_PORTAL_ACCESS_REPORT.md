# Thank-you pages, sign-up events and instant portal access: implementation report

**Date:** 2026-10-27. **Branch:** `feature/thank-you-pages-and-instant-portal-access`, built on `phase-16/seo-ga4-implementation`. **Decision record:** `docs/architecture/ADR-033-unverified-portal-access.md`. Not merged, not deployed.

## What a visitor now experiences

1. **Contact form.** After the server accepts the message, the browser reports the lead and moves to `/contact/thank-you`.
2. **Consultation form, brand-new email.** The submission creates a portal account, reports the lead and the sign-up, and moves to `/consultation/thank-you`. That page shows the next steps, a notice that the email is not verified yet, and a **Continue to your portal** button. The button signs the visitor in to the portal's welcome screen.
3. **The welcome screen.** An amber alert says **"Your email is not verified yet"**, names the address (masked), explains the activation link, and has a **Resend activation email** button. It lists what unlocks after activation. It shows nothing else.
4. **Consultation form, existing client's email.** The same thank-you page, but **no one is signed in**: the button goes to the ordinary sign-in page, and no sign-up is reported.
5. **Verifying.** Opening the emailed link and choosing a password activates the account, opens the full portal, and signs out any session that existed before.

## Why the unverified session shows so little

Anyone can type anyone's email into a public form. If that signed the submitter in to real data, a stranger could read a client's case. So:

- A session is issued **only to an account created by that very submission**. Existing accounts of any kind, including ones staff created, never get one (tested).
- The unverified session is rejected by **every** existing portal page and API. Three places opt in: the welcome screen, the resend API and the hand-off. (Tested against a protected API: 401.)
- **Verifying the account deletes every earlier session** for it. This closes the "pre-hijacking" attack, where someone signs up with a victim's email, keeps their session, and waits for the victim to verify. (Tested in the unit suite and in a two-browser journey.)

## Measurement

New GA4 events, both documented in the event dictionary and sent through the existing safe, versioned contract: **`sign_up`** (`method=consultation_form`, once, only when the submission created an account) and **`thank_you_view`** (`form_name`). `generate_lead` is unchanged: once, when the server accepts. The portal stays untagged by design, so portal **activation** is not a GA4 event; it is the existing `activation_completed` security event.

## Verification

| Check | Result |
|---|---|
| New integration tests `portal-unverified-access` | 11/11: new account shape; existing and staff-created accounts get no session; unverified session refused by the normal guard and a protected API; verified client's session cannot use the opt-in doors; pre-hijacking regression; password-holding accounts still refused at activation; repeat submission re-issues a link; resend (session needed, own address only, cooldown, origin check); hand-off (two allowed origins, other origins refused, garbage refused, verified session refused) |
| New browser journeys `portal-signup` | 4/4: sign-up to thank-you to unverified welcome with alert, locked pages and API; verification unlocks the portal and kills an earlier session; existing client's email signs nobody in; thank-you pages are `noindex`, out of the sitemap and a bare visit is a view, never a lead |
| Updated `analytics-leads` browser spec | 7/7 |
| Lint, types, full root suite, full browser suite | see the final section |

## Things to know before merging

- **No database change and no production index.** `pending` already existed and is shared with the Express mirror; the session token is reused for the hand-off, so there is no new collection.
- **Unverified accounts accumulate**, one per new-email submission, including spam. They are inert (no password) and staff will see them as pending clients. A retention job for pending accounts older than the invitation lifetime is recommended and not built.
- **Whether an email is new is visible to the submitter** (the button either signs them in or goes to the sign-in page). The previous redirect already leaked this; the requested feature cannot hide it. Recorded in ADR-033.
- **`SITE_URL` must be the portal origin in production** (`https://app.immigrationhorizons.com`), which is already required. The thank-you page posts the hand-off there, and the welcome route accepts it from the portal origin or `NEXT_PUBLIC_SITE_URL` only. The existing `check-env` audit covers both variables.
- The shared `Button` gained a `sameTab` option, because it opens every absolute link in a new tab and the portal hand-off should not.
- The old `/portal/check-email` page is no longer reached by the form. It is left in place for existing emailed links and can be removed later.
