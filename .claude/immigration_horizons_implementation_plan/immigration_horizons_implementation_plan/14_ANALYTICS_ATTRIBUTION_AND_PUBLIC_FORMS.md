# 14 — Analytics, Attribution, and Public Forms

## Purpose

Preserve and improve lead attribution while adding portal onboarding and conversion funnel measurement without allowing analytics failures to block consultations.

## Current baseline

The public application already contains consultation/contact forms, spam protection, rate limiting, Resend delivery, and consultation persistence. Attribution fields and UTM support may already exist partially.

## Form enhancements

- Shared validation schema
- normalized contact data
- submission ID/idempotency key
- duplicate-submission handling
- reliable split persistence/email outcomes
- portal invitation trigger
- safe redirect
- user-facing success/error states

## Attribution fields

Capture when available:

- UTM source
- UTM medium
- UTM campaign
- UTM term
- UTM content
- landing page
- referrer
- Google click ID
- Meta click ID
- first-touch timestamp
- latest-touch timestamp

Do not store arbitrary sensitive query parameters.

## Funnel events

Suggested events:

- Consultation form viewed
- Form started
- Form submitted
- Consultation persisted
- Email delivery succeeded/failed
- Portal invitation created
- Activation completed
- Client logged in
- Consultation converted to case
- Document request completed
- Query answered

Do not send personally identifiable case content into analytics platforms.

## Consent

Load analytics and advertising tags according to applicable consent requirements and deployment region decisions.

## Failure isolation

- Analytics errors never block submission.
- Invitation email failure never removes lead.
- Database failure and email failure are logged independently.
- Redirect remains deterministic.

## Tests

- Attribution captured from valid parameters.
- Sensitive/unrecognized parameters ignored.
- Analytics failure does not fail submission.
- Duplicate submission remains idempotent.
- Existing client linking works.
- New client invitation deduplicates.

## Acceptance criteria

- Attribution survives consultation-to-client-to-case conversion.
- Funnel events are documented.
- Sensitive data is excluded.
- Form reliability is preserved.

## Claude Code handoff

Integrate portal onboarding into the existing public form flow without redesigning the form. Preserve independent persistence/email behavior and add analytics only behind failure-safe wrappers.
