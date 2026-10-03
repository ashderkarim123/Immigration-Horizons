# ADR-025: Staff/CMS separation and guided case operations

Date: 2026-10-03
Status: Implemented on `stabilization/angular-feature-parity-audit`; release requires human approval.

## Authentication and authority

`server/utils/permissions.js` owns the employee capabilities. Its generated contract and Angular/Next.js mirrors include `admin.cms.access`, restricted to `super_admin`, `admin`, and `editor`. A correct password without that capability produces an audited CMS denial without changing password failure counters. Every protected CMS request reloads the active user and capability, so existing sessions are revoked after demotion or deactivation. The environment recovery administrator keeps its existing explicit super-administrator boundary.

The individually attributable `operations_admin` role is displayed as Staff Operations Admin. It has organization-wide operational capabilities, including case creation, team, task and channel management. It has no CMS, user-administration or settings capability. PM access continues to require live case membership. Express mounts the canonical API before CMS session handling; `ih_staff_session` and the CMS session do not substitute for one another.

## Canonical case creation

Staff creates a case for an existing active client, or converts an eligible linked consultation. The canonical case-conversion service provisions the primary CaseWorkspace, client and PM membership, document categories and channels. Conversion is idempotent. The Staff app does not offer detached workspace creation. Mongo transactions are used when supported; the existing standalone-database fallback remains. The case API returns capabilities/action flags; Angular reloads canonical detail after compact mutations and discards stale responses after navigation.

## Guided operations and retained domains

Role dashboards use capabilities, live memberships and assignments to aggregate actionable queues. Global navigation stays Dashboard, Cases, Clients, Tasks, Messages and Deadlines, with unauthorized items/actions omitted. Case navigation groups client inputs, case work, communication and management. Overview links point to actual case work, with task, message, review and activity state.

Lead intake, team planning, manual delivery records, notifications and preferences now have Staff API/UI entry points. They reuse Consultation, Sprint, Task, DeliveryRecord, InternalNote, ActivityLog and Notification. Converted leads and case-linked tasks recheck live case access. Notification recipients use immutable account IDs; removed case members also lose related converted-lead notices. Legacy EJS operations routes remain behind CMS authorization for recovery; their navigation entries and operational dashboard have been removed from the normal CMS workflow. Delivery records describe manually prepared/sent files; they do not generate a combined packet or send a delivery email.

## Documents and client intake

The server-owned category/subtype registry generates both application mirrors. New cases include the required identity, education, employment, recommendation, research, recognition, government, civil, financial and other-evidence groups. Existing category keys and records remain compatible. Optional document-request subtype is mirrored in both models. Requested uploads bind the authenticated client, live membership, case, category, request and subtype; replacement comments remain next to the replacement action. General uploads collect meaningful metadata and support native selection and drag/drop. Existing secure storage and download authorization remain in force.

The Client dashboard puts Action required first and excludes employee-only notes and content. Smart Forms retain their existing templates, field keys, autosave, revision conflicts, audit and review/lock lifecycle. Country options are generated into a checked-in static list so Node and browser ICU differences cannot cause hydration to replace an edited form. Updating those labels requires regenerating `scripts/generateCountries.cjs`. Multi-party canonical facts and USCIS PDF mapping remain future product work; no Phase 11 tracking or USCIS generator is introduced.

## Verification and release boundary

Playwright uses a built Next.js app, the release Angular bundles, actual HTTP/session flows and isolated fixture data. It clears email-provider credentials and replaces the database URI with the test helper's database before loading either application. Root, server and browser Mongo suites run sequentially locally. Separate CI jobs use separate databases. Browser traces and screenshots use synthetic data and are retained as CI artifacts.

No production database, migration, index, seed, nginx, merge or deployment action is authorized by this ADR. Production readiness and rollback checks follow ADR-024 and the stabilization report. Browser automation establishes functional behavior in Chromium; human learnability, assistive-technology, delivery-email and production cutover acceptance remain explicit release checks.
