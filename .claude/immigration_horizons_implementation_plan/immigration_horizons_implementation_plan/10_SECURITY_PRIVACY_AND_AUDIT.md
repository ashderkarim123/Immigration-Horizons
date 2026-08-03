# 10 — Security, Privacy, and Audit

## Purpose

Protect sensitive immigration, identity, employment, and legal-support information across authentication, cases, files, messages, and operations.

## Security baseline

Already present or previously identified:

- bcrypt password hashing for admin users
- login rate limiting
- Helmet
- session fixation protection during admin login
- stored-XSS fix for admin search
- capability-based authorization
- known need for CSRF, private documents, stronger auditing, and production verification

## Required controls

### Authentication

- Secure password hashing
- Generic errors
- rate limits
- session rotation
- lock/delay after repeated failures
- password reset invalidation
- email verification
- disabled-account enforcement

### Authorization

- Global capabilities
- workspace membership
- channel visibility
- resource ownership
- fail-closed defaults
- immediate revocation after removal

### CSRF

Protect all state-changing browser requests. Select token strategy based on the final same-origin/session architecture.

### XSS

- Escape by default
- No raw HTML messages
- Sanitize controlled rich text
- Never render uploaded active content inline
- Regression tests for search, messages, notes, and CMS output

### File security

- Private storage
- authorized downloads
- random keys
- checksum
- MIME/signature checks
- quarantine
- malware-scanning integration
- forced downloads for risky types

### Audit

Record:

- Login success/failure
- activation/reset events
- membership changes
- case changes
- query status changes
- document access and review
- message moderation
- permission-denied events when useful

Audit entries should contain actor, action, target, time, result, and structured metadata.

### Privacy

- Minimize stored data
- Define retention periods
- Redact logs
- Restrict exports
- Avoid sensitive analytics
- Support account deactivation and controlled deletion workflows

## Threat scenarios to test

- Client guesses another case ID.
- Employee knows a document ID from another case.
- Removed member reuses an old link.
- Client attempts internal channel access.
- Forged MIME upload.
- CSV formula injection.
- Stored XSS in message or profile field.
- Invitation token reuse.
- Session fixation.
- CSRF against document review or membership changes.
- Socket room join without membership.

## Compliance note

Technical controls do not establish legal compliance. Data-processing, privacy, retention, professional-responsibility, and immigration-service obligations require review by qualified legal/compliance personnel.

## Acceptance criteria

- Threat model documented.
- Critical routes have negative authorization tests.
- Files are private.
- CSRF is implemented before production.
- Audit records are append-oriented and protected.
- Logs contain no secrets or raw document content.
- Retention and incident procedures are documented.

## Claude Code handoff

Apply these controls continuously to every module. Do not defer row-level authorization or internal/client data separation until a final hardening pass.
