# 02 — Client Authentication and Consultation Onboarding

## Purpose

Allow consultation submitters and existing clients to securely activate and use a client portal without mixing client identities with employee accounts.

## Business flow

```text
Submit consultation
  → persist lead
  → normalize email
  → link existing client OR create pending invitation
  → send email independently
  → redirect to onboarding page
  → activate account or log in
  → show consultation in client dashboard
```

A consultation submission must never automatically authenticate the submitter.

## Dependencies

- Architecture foundation
- Existing consultation form actions
- Existing Resend integration
- Shared database access
- Session design decision

## Data models

### ClientUser

Recommended fields:

- `email`
- `normalizedEmail`
- `passwordHash`
- `firstName`
- `lastName`
- `phone`
- `status`: `pending`, `active`, `locked`, `disabled`
- `emailVerifiedAt`
- `lastLoginAt`
- `failedLoginCount`
- `lockedUntil`
- `acceptedTermsAt`
- `passwordChangedAt`
- timestamps

Indexes:

- Unique `normalizedEmail`
- `status`
- Optional `lastLoginAt`

### PortalInvitation

Fields:

- `normalizedEmail`
- `clientUser`
- `consultation`
- `tokenHash`
- `purpose`
- `expiresAt`
- `usedAt`
- `revokedAt`
- `attemptCount`
- `createdByType`
- `createdByAdmin`
- timestamps

Indexes:

- Unique/selective `tokenHash`
- TTL `expiresAt`
- `normalizedEmail + purpose + usedAt`

### PasswordResetToken

Use a separate model or a generalized secure-token model. Store only token hashes.

## Required routes

Client-facing routes:

- `GET /portal/login`
- `POST /portal/login`
- `POST /portal/logout`
- `GET /portal/activate`
- `POST /portal/activate`
- `GET /portal/forgot-password`
- `POST /portal/forgot-password`
- `GET /portal/reset-password`
- `POST /portal/reset-password`
- `GET /portal`
- `GET /portal/consultations`
- `GET /portal/consultations/:id`

Public submission behavior:

- New client: redirect to `/portal/check-email`
- Existing client: redirect to `/portal/login?next=/portal/consultations`
- Do not reveal account existence in public messages.

## Session requirements

- HTTP-only cookie
- Secure in production
- SameSite appropriate to deployment
- Session rotation after login and activation
- Idle timeout
- Absolute timeout
- Logout invalidation
- Password-reset invalidation
- Shared session store if multiple instances are used

## Security requirements

- Existing password hashing or stronger compatible algorithm
- Generic login errors
- Login rate limiting
- Activation rate limiting
- Constant-time token comparison where applicable
- Single-use invitations
- Token expiration
- No plaintext tokens in database or logs
- No account enumeration
- Disabled users blocked immediately
- CSRF protection before production

## Consultation linking

Add an optional `clientUser` reference to consultations.

Rules:

- Match by normalized email.
- Never relink a consultation already linked to a different client without an audited administrative workflow.
- Repeated submissions by an existing client should link to the same account.
- Invitation email failure must not roll back the consultation.
- Avoid unlimited duplicate invitations.

## Implementation steps

1. Add schemas and indexes.
2. Add normalization utilities.
3. Add activation token creation and redemption.
4. Add client session middleware.
5. Add login/logout.
6. Add forgot/reset password.
7. Update consultation submission flow.
8. Add onboarding redirect pages.
9. Add basic dashboard and consultation list.
10. Add audit events.
11. Add integration tests.
12. Document new environment variables.

## Tests

- New consultation creates one pending invitation.
- Existing client is linked without duplicate account.
- Email failure does not remove consultation.
- Expired token rejected.
- Used token rejected.
- Revoked token rejected.
- Successful activation rotates session.
- Client sees own consultation.
- Client cannot see another consultation.
- Disabled client cannot log in.
- Generic error prevents enumeration.
- Logout invalidates session.

## Acceptance criteria

- Clients and employees use separate models and sessions.
- Submitters are redirected safely.
- No automatic login from form submission.
- New clients can activate and set a password.
- Existing clients can log in.
- Own-consultation access is enforced server-side.
- Integration tests pass against an isolated database.

## Claude Code handoff

Implement client authentication and consultation linking only. Do not add cases, documents, or chat yet. Preserve existing consultation persistence and email behavior, and ensure invitation failures never block lead creation.
