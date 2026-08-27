# Agent telemetry continuous collection

`aitk agent-telemetry install` is the canonical setup path. One installation
owns exactly one `(agentId, source)` stream, collector credential, checkpoint,
and scheduler. The default launchd interval is six hours.

This telemetry is different from `aitk usage report`:

- `usage report` records a person's coarse Claude Code/Codex totals and plan
  information.
- `agent-telemetry` records scoped, checkpointed agent/runtime usage plus tool,
  skill, collection-health, and explicit execution aggregates when the source
  exposes them.

Neither path uploads transcript text, prompts, responses, commands, raw IDs, or
local paths.

## Requirements

- macOS. Other schedulers are not installed automatically yet.
- Packaged `@gpters/aitk` 0.7.0 or newer in a stable global path. Do not install
  from an ephemeral `npx` cache path because launchd keeps the resolved CLI
  path.
- AITK user authentication (`aitk login --device` when needed).
- An explicit source scope. Do not infer a path or profile when multiple users
  or agents may share it.
- The server migration that creates `ax_agent_telemetry_collectors` and the
  matching enrollment endpoint must be deployed first.

## One-time install

The user must approve the install command. It runs a PII-free dry run first and
stops if collection health is blocked. It then exchanges the existing user
login for a collector-only credential, stores that credential in macOS
Keychain, writes a token-free local config, and registers launchd.

```sh
aitk whoami

aitk agent-telemetry install \
  --agent <stable-agent-id> \
  --source claude-code \
  --sessions-dir "$HOME/.claude/projects" \
  --project-slugs <allowed-project-directory> \
  --days 7
```

Codex uses the same form with its sessions directory and allowed workspace
names. OpenClaw omits `--project-slugs` and must point at the explicit agent
session directory. Do not install OpenClaw and Claude Code collectors for
overlapping work; prefer the runtime transcript because gateway summaries lack
reliable tool and skill activity.

The stable `agentId` should make ownership clear across the organization, for
example a bot name or a user-and-runtime combination. The server refuses a
second active collector for the same `(agentId, source)` so two schedulers
cannot silently double-count one stream.

If a matching legacy pilot checkpoint already exists, `install` adopts its
`collectorInstanceId` automatically. It does not reset or delete the checkpoint,
so the first enrolled upload continues from the last committed window.

Use `--no-schedule` only for an intentional staged install. It enrolls and
stores configuration without sending; `run` remains an explicit action.

## Hermes scope

Hermes uses an explicit SQLite database file and a non-empty profile identity:

```sh
aitk agent-telemetry install \
  --agent <stable-agent-id> \
  --source hermes \
  --sessions-dir "$HOME/.hermes/state.db" \
  --hermes-profile <dedicated-profile-name> \
  --days 7
```

The collector opens the database read-only and queries only structural and
usage columns. If a shared Gateway database has null or mixed profile identity,
do not install against it. Create a dedicated Hermes profile/DB or add a stable
agent identity in the Gateway first; historical shared sessions are not safe to
backfill into a bot identity.

## Verify and operate

```sh
aitk agent-telemetry status --agent <id> --source <source>
aitk agent-telemetry doctor --agent <id> --source <source>
aitk agent-telemetry run --agent <id> --source <source>
```

- `status` checks local configuration, Keychain presence, and scheduler state.
- `doctor` performs a dry run without uploading or advancing the checkpoint.
- `run` performs one immediate upload using the Keychain credential.
- Success is the JSON response body with `ok: true`, not exit code alone.

After a CLI or runtime upgrade, run `doctor`. The dashboard differentiates a
registered collector waiting for its first batch, a healthy reporter, a stale
reporter, and a health-blocked reporter.

To remove a stream:

```sh
aitk agent-telemetry uninstall --agent <id> --source <source>
```

Uninstall revokes the server credential and removes launchd, the Keychain item,
and the local installation record. It preserves the checkpoint for audit and
recovery.

## Security model

- The raw collector credential exists only in macOS Keychain and is returned by
  the enrollment API once. The server stores a SHA-256 hash.
- The credential is bound to `agentId`, `collectorInstanceId`, and `source`.
  Changing any of the three causes the ingestion request to be rejected.
- Local configuration is mode `0600` and contains no credential.
- A failed upload preserves the pending batch. Retry uses the same `batchId`,
  and server idempotency prevents double counting.
- Legacy environment tokens remain accepted during migration, but new installs
  must use enrollment credentials.

## Review cadence

- Automatic: launchd runs every six hours; the normal stale threshold is two
  missed runs (at least twelve hours).
- Daily: check reporter freshness, source coverage, parse failures, and pending
  checkpoints before interpreting usage trends.
- Weekly: review context tokens per turn, reasoning share, model mix, tool
  failure hotspots, and verified skill execution outcomes.
- Rollout: add one scoped stream at a time, independently compare its first
  backfill with the source of truth, and keep the same checkpoint.

## Legacy manual setup

`collect-macos.zsh` and `com.gpters.agent-telemetry.example.plist` remain only
for existing pilot installations until they are migrated. New agents should not
copy the plist or share `AX_AGENT_TELEMETRY_TOKEN`; use `install` instead.
