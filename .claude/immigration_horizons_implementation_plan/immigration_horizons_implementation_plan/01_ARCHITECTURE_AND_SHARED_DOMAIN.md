# 01 — Architecture and Shared Domain Foundation

## Purpose

Create the technical foundation that allows the Next.js public/client application and Express/EJS admin application to work with the same domain data safely without duplicating business rules.

## Current baseline

- Next.js application exists at the repository root.
- Express/EJS admin exists under `/server`.
- Both applications use MongoDB.
- The admin has session authentication and capability-based authorization.
- Public forms write consultation records.
- Tasks attach directly to consultations.
- There is no formal client, case, workspace, or membership domain yet.

## Scope

- Architecture decision records
- Shared model ownership strategy
- Actor identity types
- Error and response conventions
- Authorization policy interfaces
- Application bootstrapping for tests
- Safe shared utility boundaries

## Out of scope

- Client UI
- Documents
- Messaging
- Real-time events
- Production infrastructure changes

## Key decisions

### Application responsibilities

Preferred responsibility split:

- **Next.js:** public pages, consultation forms, client portal pages, client-facing server actions/API calls.
- **Express:** admin pages, operational APIs, internal employee workflows, future Socket.IO server.
- **MongoDB:** shared source of truth.
- **Shared package or library:** schemas/types, validation, actor definitions, domain constants, and pure authorization policies where practical.

Do not force shared runtime code that makes one app depend on the other app's framework.

### Identity types

Use explicit actors:

```ts
EmployeeActor = { type: 'employee', adminUserId, role, capabilities }
ClientActor   = { type: 'client', clientUserId }
SystemActor   = { type: 'system', service }
```

Never infer actor type from a route name or a role string alone.

### Authorization layers

Each protected operation must pass:

1. Authentication
2. Global capability check
3. Record-level access check
4. Resource-state validation

Example:

```text
Employee has `documents.review`
AND employee is an active workspace member
AND document belongs to that workspace
AND document is not archived
```

### Shared identifiers

Use MongoDB ObjectIds as internal identifiers. Use stable public identifiers such as `caseNumber` only for display and search. Never authorize access from a public case number alone.

## Proposed shared modules

Suggested package structure when compatible with the repository:

```text
/shared
  /domain
    actors.ts
    capabilities.ts
    case-types.ts
    statuses.ts
  /validation
    auth.ts
    cases.ts
    consultations.ts
    documents.ts
    messages.ts
  /policies
    case-access.ts
    workspace-access.ts
    channel-access.ts
    document-access.ts
  /errors
    domain-errors.ts
```

If the repository is JavaScript-heavy, implement compatible JavaScript modules plus `.d.ts` types rather than forcing a TypeScript migration of the Express application.

## Implementation steps

1. Inspect current import boundaries and package managers.
2. Decide whether a root workspace package is safe.
3. Add architecture decision record:
   - portal hosting
   - API boundary
   - sessions
   - CSRF
   - storage
   - real-time
4. Extract only pure constants and policies first.
5. Refactor Express startup so tests can import the app without listening or exiting.
6. Add environment-specific database lifecycle handling.
7. Add shared error codes and controlled `403/404/409/422` responses.
8. Document rollback.

## Security requirements

- No permissive wildcard CORS.
- No cross-app trust based only on a custom header.
- Same-origin cookies are preferred.
- Shared secrets must be environment variables.
- Production startup validation must remain intact.
- Missing actor or role must fail closed.

## Tests

- App import does not start a listener.
- Test mode never connects to production.
- Unknown actor type fails closed.
- Missing role fails closed.
- Policy helpers reject mismatched workspace/case combinations.
- Public and admin builds still work.

## Acceptance criteria

- Architecture decisions are documented.
- Shared modules contain only framework-independent logic.
- Both applications can import shared constants safely.
- Tests can boot applications without production side effects.
- No existing routes are broken.

## Claude Code handoff

Implement only the architecture foundation. Inspect the repository first, document the chosen boundary, add the minimum shared modules, and refactor startup only as needed for testing. Do not start client authentication, cases, documents, or messaging in this module.
