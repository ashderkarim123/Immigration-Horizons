# 13 — Deployment, Observability, and Backups

## Purpose

Prepare the expanded platform for secure, diagnosable, and recoverable production operation.

## Deployment questions to resolve

- Are Next.js and Express served under one domain?
- How does nginx route `/portal`, `/admin`, `/api`, and sockets?
- Is there one application instance or multiple?
- What session store is used?
- Which object storage provider is approved?
- How are secrets managed?
- What MongoDB topology supports transactions?
- How are email failures monitored?

## Environment variables

Expected categories:

- MongoDB URIs
- client session secret
- admin session secret
- public base URL
- admin base URL
- API base URL
- Resend credentials
- invitation/reset token settings
- private storage provider and credentials
- file-size limits
- socket/pub-sub settings
- log level
- analytics IDs

Use startup validation and never log secret values.

## Reverse proxy

Document:

- HTTPS termination
- trusted proxy settings
- `X-Forwarded-For` overwrite behavior
- secure cookies
- WebSocket upgrade headers
- request body/upload limits
- route mapping
- static asset caching
- private route no-cache behavior

## Observability

Add structured logs for:

- Authentication events
- failed authorization
- form persistence/email split outcomes
- query scheduling/answering
- document upload/review/download
- message creation
- notification failures
- migration/index scripts

Add health endpoints:

- liveness
- readiness
- database connectivity
- storage connectivity when appropriate

Do not expose secrets or detailed stack traces publicly.

## Backups and recovery

Document:

- MongoDB backup schedule
- object storage versioning/backup
- retention
- encryption
- restore test cadence
- restoration order
- incident ownership
- recovery time and recovery point targets

Run restore drills before relying on backups.

## Rollout strategy

- Feature flags for portal, documents, and chat
- Staged deployment
- Internal employee pilot
- Limited client pilot
- monitored expansion
- rollback commands

## Acceptance criteria

- Deployment topology documented.
- Session and proxy assumptions verified.
- Structured logs exist.
- Health checks exist.
- Backup and restore procedures are documented and tested.
- Real-time scaling requirements are explicit.

## Claude Code handoff

Do not guess production settings. Inspect deployment files, document unresolved infrastructure questions, add safe validation and runbooks, and keep feature rollouts reversible.
