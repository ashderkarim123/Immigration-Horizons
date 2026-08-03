# 09 — Client Portal Experience

## Purpose

Provide clients with a clear, secure view of consultations, cases, messages, documents, schedules, updates, profile, and account security.

## Dependencies

- Client authentication
- Cases/workspaces
- Query tracking
- Documents
- Messaging
- Notifications

## Portal navigation

- Dashboard
- Consultations
- Cases
- Messages
- Documents
- Notifications
- Profile
- Security
- Logout

## Dashboard

Show:

- New consultation status
- Upcoming consultation or query schedule
- Active cases
- Current client-visible case stage
- Outstanding document requests
- Documents needing replacement
- Recent messages
- Recent case updates
- Client-visible deadlines
- Unread notifications

Do not show:

- Internal notes
- Employee-only channels
- Internal tasks
- Draft-review comments
- Internal risk assessments
- Employee performance information

## Case page

Sections:

- Overview
- Timeline
- Messages
- Documents
- Consultations and questions
- Client action items
- Team members intended for client display

## UX principles

- Mobile-first layouts
- Accessible forms and labels
- Clear status language
- Timezone-aware scheduling
- Upload progress and retry feedback
- Safe empty states
- Human-readable audit/timeline entries
- No confusing internal role names
- Consistent terminology across portal and emails

## Privacy and authorization

- Every server-rendered page and API request re-checks identity and membership.
- Do not rely on hidden UI.
- Controlled `404` may be preferable to revealing resource existence.
- Never cache private pages publicly.
- Prevent sensitive data in analytics payloads.

## Error states

Handle:

- Invitation expired
- Account disabled
- Session expired
- Unauthorized case
- Upload rejected
- Document quarantined
- Message failed
- Schedule changed
- No active case yet

## Tests

- Client dashboard contains only own data.
- Internal fields absent from rendered HTML and JSON.
- Session expiry redirects safely.
- Cross-client URLs denied.
- Accessible labels and form errors.
- Mobile navigation works.
- Private pages send appropriate cache headers.

## Acceptance criteria

- A new client can move from consultation submission to activation and dashboard.
- A client can understand the current status of every consultation and case.
- Documents and messages are easy to find.
- Internal data never appears.
- Portal remains usable on mobile and keyboard navigation.

## Claude Code handoff

Build portal screens only after the corresponding backend module is complete. Use server-side authorization on every route and avoid mock data in production paths.
