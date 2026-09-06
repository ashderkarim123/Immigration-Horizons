# ADR-016 — Authentication boundaries for clients, employees, and administrators

**Status:** Accepted for the Angular migration  
**Date:** 2026-09-06  
**Branch:** `architecture/angular-enterprise-platform`

## Context

Immigration Horizons has two fundamentally different identity populations:

1. **Clients**, where sign-in should be extremely low-friction and self-service.
2. **Employees/administrators**, where accounts must be explicitly provisioned and controlled by Immigration Horizons.

The production system already has separate client and employee identities, separate session collections/cookies, lockout protection, role/capability authorization, workspace membership authorization, and security-event logging. The Angular migration must preserve those boundaries while improving usability.

## Decision

### Clients

Client authentication will move toward **Firebase Authentication for external identity only**.

Initial client providers:

- Google Sign-In as the primary option;
- passwordless email-link sign-in as the secondary option;
- existing legacy email/password authentication remains temporarily during migration.

Firebase Authentication does **not** replace MongoDB application records.

`ClientUser`, `ClientCase`, `CaseWorkspace`, `WorkspaceMember`, documents, tasks, messages, notifications, consultations and all other Immigration Horizons domain records remain authoritative in MongoDB.

Firestore is not introduced for case-management/application data.

A Firebase identity must be verified by the Immigration Horizons backend and linked to a `ClientUser`. Authentication alone never grants case access. Case access continues to come from the existing workspace/member policy.

### Employees and administrators

Employees and administrators will use **Immigration Horizons-managed credentials**, not Firebase identity.

Employee accounts are created by an authorized administrator. No employee self-registration exists.

The administrator chooses at minimum:

- name;
- email;
- role;
- active/inactive status;
- optional department/job title when those fields are introduced.

A new employee receives a cryptographically strong **temporary password**. The temporary credential may be displayed to the creating administrator once for secure sharing, but it must never be recoverable later from the database.

On first successful sign-in, the employee is required to set a private permanent password before receiving normal application access.

The administrator must never be able to view the employee's permanent password.

### Employee lifecycle

Target employee flow:

```text
Authorized admin
   ↓
Create AdminUser
   ↓
Generate strong temporary password
   ↓
Store bcrypt hash only
   ↓
mustChangePassword = true
   ↓
Admin securely shares temporary credential
   ↓
Employee signs in at app.*
   ↓
Restricted first-login session/state
   ↓
Employee sets private password
   ↓
mustChangePassword = false
passwordChangedAt = now
   ↓
Normal EmployeeSession
   ↓
Role/capabilities
   ↓
Workspace/case membership authorization
```

A password reset initiated by an administrator follows the same pattern: issue a new temporary password, force a password change, and revoke existing employee sessions.

## Existing models and additive fields

`AdminUser` remains the employee/administrator identity. Do not create a second `Employee` authentication collection.

The existing `AdminUser` already owns employee credential, role, status and lockout state. The migration may add backwards-compatible fields such as:

- `mustChangePassword: boolean`;
- `credentialIssuedAt: Date | null`;
- `passwordChangedAt: Date | null`;
- `jobTitle: string`;
- `department: string`;
- `createdBy: ObjectId | null` where audit requirements justify it.

New fields must begin optional/defaulted so existing accounts continue to work unless a deliberate migration says otherwise.

The Next.js `AdminUser` mirror and Express-owned model must remain schema-compatible for shared fields. Express remains the owner of employee credential creation and password changes.

## Employee sessions

Continue using the existing `EmployeeSession` / `employee_sessions` collection and the `ih_staff_session` cookie.

Preserve:

- opaque cryptographically random browser token;
- SHA-256 token hash at rest;
- HttpOnly cookie;
- Secure in production;
- SameSite=Lax unless a future host decision requires a reviewed change;
- absolute expiry;
- idle expiry;
- live `AdminUser` role/status re-read;
- immediate revocation when an account is disabled;
- role changes effective on the next authenticated request.

Do not replace staff sessions with JWT/localStorage authentication.

The Express canonical API must gain a compatible `EmployeeSession` model/service rather than creating a second employee session system.

## Authorization

Authentication, role authorization and row-level case authorization remain separate:

```text
Password proves employee identity
        ↓
AdminUser role → capabilities
        ↓
WorkspaceMember → case/resource scope
```

Angular route guards and hidden navigation are presentation only. Every API operation must independently enforce authentication, capability requirements and case/workspace policy.

No administrator may grant a role by editing browser state. Firebase custom claims are not used for employee roles.

## Employee account administration

The existing CMS already has `users.manage`-protected user administration and owns `AdminUser` creation. During migration that surface should be enhanced, not bypassed.

Required administrative operations over time:

- create employee;
- issue temporary credentials;
- change role;
- activate/deactivate account;
- force password change;
- reset employee credentials;
- revoke all employee sessions;
- inspect last login/security events;
- inspect assigned cases where authorized.

There is never a "view password" operation.

## Client Firebase session boundary

The browser may authenticate with Firebase, but normal Immigration Horizons API authorization should continue through an Immigration Horizons HttpOnly client session after the backend verifies the Firebase ID token and reconciles it with a `ClientUser`.

Recommended flow:

```text
Google / email-link
      ↓
Firebase Authentication
      ↓
short-lived Firebase ID token
      ↓
Immigration Horizons backend verification
      ↓
reconcile verified email/Firebase UID with ClientUser
      ↓
ClientSession + ih_portal_session
      ↓
normal portal authorization
```

Do not put Firebase Admin credentials in Angular or client-side Next.js code. Do not commit service-account JSON.

## Firestore

Firestore is explicitly outside this architecture decision for Immigration Horizons domain data.

Do not create Firestore mirrors of clients, cases, documents, tasks, messages, CMS records or authorization state. A future realtime/offline requirement would require a separate ADR.

## Security events

Record material employee identity events, including where applicable:

- employee account created;
- temporary credential issued/reset;
- login succeeded/failed;
- account locked;
- initial password changed;
- password reset by administrator;
- role changed;
- account activated/deactivated;
- session revoked/all sessions revoked;
- CSRF/origin rejection.

Do not record plaintext passwords or temporary credentials in event metadata/logs.

## Consequences

Clients get a low-friction modern identity experience without moving the case-management database to Firebase. Employees remain centrally provisioned and controlled by the organization. Both actor types retain separate sessions and separate authorization policies, which preserves the security boundaries already present in production while allowing the new Angular staff application to use a clean canonical API.