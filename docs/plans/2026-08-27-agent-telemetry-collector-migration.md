# AX 0031 collector registry migration

0031 adds the empty server-side registry used by self-installed agent telemetry
collectors. It does not update or delete existing batches, usage rows, execution
reports, users, or memberships.

## Schema effect

- Creates `ax_agent_telemetry_collectors`.
- Stores collector scope, interval, credential hash, revocation state, and the
  last successful collection health/freshness.
- Enforces one active registry row per `(agent_id, source)` and binds each raw
  token to one collector ID.
- Starts empty. Existing legacy-token collectors continue to work and can be
  enrolled later without resetting their checkpoints.

## Local verification

```sh
pnpm ax:local:verify-rebuild
pnpm --filter @gpters/db test:ax-child-guard
```

The clean rebuild must preserve the five telemetry batch fixtures and create an
empty collector registry with 18 columns, 5 indexes, and 7 constraints.

## Neon child branch

The runner first performs a read-only preflight. It requires the exact 0030
baseline (20 recorded migrations), a non-production child branch, all 0030 AX
objects, and no partially-created collector table.

```sh
pnpm --filter @gpters/db db:migrate:agent-collector-child -- \
  --env-file ../../apps/web/.env.ax-child \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID"
```

After reviewing the output, repeat the same command with `--apply`. The runner
then requires 21 recorded migrations, 0031 as latest, the complete registry
shape, and zero registry rows.

## Production

Production requires a recovery branch ID distinct from production and a second
explicit confirmation. The recovery branch must be created from the current
production data+schema immediately before apply.

```sh
pnpm --filter @gpters/db db:migrate:agent-collector-production -- \
  --env-file ../../apps/web/.env.production.local \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID" \
  --recovery-branch-id "$AX_NEON_RECOVERY_BRANCH_ID"
```

Review the read-only result, then append:

```text
--apply --confirm-production-migration apply-ax-0031
```

Apply 0031 before deploying the enrollment endpoint. Deploy the web server
before publishing/installing AITK 0.7.0, otherwise clients could enroll against
an unavailable API. Existing legacy-token ingestion remains available during
this rollout.

The older 0026–0030 guarded runner is intentionally archived now that the
repository journal contains 0031; it refuses to run rather than accidentally
applying an unapproved newer migration.
