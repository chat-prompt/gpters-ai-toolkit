# GPTers Domain Access Enforcement Plan

**Goal:** Restrict AI Toolkit web, CLI, and MCP access to `@gpters.org` identities, then remove existing external accounts without deleting their authored catalog content or audit history.

**Success criteria:**

- New Google sign-ins outside the exact `gpters.org` domain are rejected before user or membership writes.
- Existing web JWT sessions outside the allowed domain no longer authorize protected routes.
- Existing CLI and MCP access tokens owned by external users fail validation.
- Production contains zero non-`@gpters.org` users and zero credentials owned by them after cleanup.
- Existing GPTers login and token flows continue to pass regression tests.

## Implementation

1. Add a shared, Edge-safe exact-domain email policy in `@gpters/lib/account-access` with tests for normalization and lookalike-domain rejection.
2. Apply the policy in both NextAuth configurations, remove the web-only Public organization fallback, and invalidate external or deleted-user JWT state.
3. Apply the same policy during OAuth access-token validation so AITK CLI and MCP requests cannot use external-user tokens.
4. Add regression tests covering external sign-in rejection, stale web session rejection, and external token rejection; run focused tests, typecheck, lint, and build.

## Release and cleanup

1. Commit only task-related files, push the exact commit, and deploy it to production.
2. Verify production rejects an external web identity and preserves GPTers access; verify an external CLI/MCP credential is unauthorized when a testable credential exists.
3. Run a read-only production dry-run listing every external user and dependent row count.
4. In one targeted transaction, detach authored content only where required by foreign keys, then delete external users so credential and membership cascades run.
5. Verify zero external users, memberships, access tokens, refresh tokens, authorization codes, and device codes remain.
