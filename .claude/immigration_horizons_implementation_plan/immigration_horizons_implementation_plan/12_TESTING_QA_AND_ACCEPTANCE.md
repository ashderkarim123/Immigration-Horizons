# 12 — Testing, QA, and Acceptance

## Purpose

Ensure every module is validated through real HTTP requests, sessions, MongoDB persistence, and negative authorization scenarios.

## Test layers

### Unit

- Pure capability map
- policy helpers
- status validation
- token hashing
- email normalization
- file metadata validation
- serializers

### Integration

Use real Express/Next handlers, sessions, and isolated MongoDB.

Preferred tools:

- Existing test framework
- `supertest`
- `mongodb-memory-server` or guarded `TEST_MONGODB_URI`

### End-to-end

Critical journeys:

1. Submit consultation
2. Activate client account
3. Log in
4. View own consultation
5. Manager converts to case
6. Client sees case
7. Client submits query
8. Manager answers
9. Client uploads document
10. Manager reviews/replaces
11. Client and team exchange messages

## Test database safety

- Refuse production-like URI.
- Clear relevant collections between tests.
- Restore environment variables.
- Close all connections.
- Avoid test-order dependency.

## Mandatory negative tests

- Missing role
- Unknown role
- Missing membership
- Removed membership
- Cross-client case access
- Cross-case document access
- Client internal-channel access
- Internal field serialization
- expired/reused tokens
- invalid ObjectIds
- MIME mismatch
- oversized upload
- CSRF failure
- socket room authorization

## Regression checks

- Existing public consultation submission
- Existing admin login
- Existing lead list/detail
- capability protections
- XSS escaping
- CSV formula sanitization
- public and admin builds

## Quality commands

Admin:

- tests
- integration tests
- lint/syntax checks
- startup smoke test

Public/client:

- type checks
- lint
- production build

## Definition of done

A module is not done unless:

- Happy-path tests pass.
- Rejected requests leave the database unchanged.
- Negative access tests exist.
- Build checks pass.
- schema/index changes are documented.
- rollback is documented.
- no work is falsely reported as verified.

## Claude Code handoff

For every module, write tests before or alongside route implementation. Include exact commands and results in the final report, including environment-related failures.
