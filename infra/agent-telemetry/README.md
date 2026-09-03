# Agent telemetry continuous collection

`aitk agent-telemetry install` is the canonical setup path. One installation
owns exactly one `(agentId, source)` stream, collector credential, checkpoint,
and scheduler. The default launchd interval is one hour.

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
- AITK 0.7.0 or newer in a stable user path. Hermes default-profile compatibility
  requires 0.7.1 or newer. Current OpenClaw auto-detection, including safe JSONL
  fallback around unrelated sibling SQLite files, requires 0.7.2 or newer.
  Sessionless skill journey linking requires 0.7.3 or newer.
  Hermes skill-load counting (skill_view) requires 0.7.5 or newer.
  Internal agents install the CLI from an approved repository commit with
  `install-from-repo.sh`; publishing a new npm package is not required.
- Node.js and Corepack/pnpm. If Bun is not already installed, the repo
  installer fetches pinned `bun@1.4.0` only as a temporary build tool.
- AITK user authentication (`aitk login --device` when needed).
- An explicit source scope. Do not infer a path or profile when multiple users
  or agents may share it.
- The server migration that creates `ax_agent_telemetry_collectors` and the
  matching enrollment endpoint must be deployed first.

## Install AITK from the repository

Use an approved, pinned `main` commit. The repository is only a build input:
the installer copies the built CLI to a versioned user directory, so moving or
deleting the clone later does not break launchd.

```sh
git fetch origin main
git checkout <approved-main-commit>
sh infra/agent-telemetry/install-from-repo.sh
"$HOME/.local/bin/aitk" --version
```

The resulting paths are:

```text
~/.local/share/gpters-aitk/<version>/aitk.js
~/.local/bin/aitk
```

The script refuses dirty telemetry build inputs, an unmanaged existing `aitk`
wrapper, or different contents under the same version. `--allow-dirty` and
`--force` are recovery/development overrides and require explicit review. Use
`--skip-build` only when the checkout already contains a verified build.

The npm release workflow remains available for future external distribution,
but internal collector rollout does not depend on it.

## One-time install

The user must approve the install command. It runs a PII-free dry run first and
stops if collection health is blocked. It then exchanges the existing user
login for a collector-only credential, stores that credential in macOS
Keychain, writes a token-free local config, and registers launchd.

```sh
"$HOME/.local/bin/aitk" whoami

"$HOME/.local/bin/aitk" agent-telemetry install \
  --agent <stable-agent-id> \
  --source claude-code \
  --sessions-dir "$HOME/.claude/projects" \
  --project-slugs <allowed-project-directory> \
  --days 7
```

Codex uses the same form with its sessions directory and allowed workspace
names. OpenClaw omits `--project-slugs` and must point at one explicit agent
root, its legacy `sessions` directory, or its `openclaw-agent.sqlite` file. Add
`--openclaw-agent <internal-agent-id>` when the internal identity is known. The
collector verifies SQLite `schema_meta.agent_id`, prefers the current SQLite
store over archived JSONL, ignores unrelated sibling SQLite files before
falling back to JSONL, and refuses a multi-agent parent directory. Do not
install OpenClaw and Claude Code collectors for overlapping work; prefer the
runtime transcript when gateway summaries lack reliable tool and skill activity.

```sh
"$HOME/.local/bin/aitk" agent-telemetry install \
  --agent <dashboard-agent-id> \
  --source openclaw \
  --sessions-dir <one-openclaw-agent-root-or-store> \
  --openclaw-agent <internal-openclaw-agent-id> \
  --days 7
```

OpenClaw's outer `--profile` selects a separate state directory, while a Gateway
may contain multiple internal agents. Install one collector per intended
internal agent and never point a collector at the shared state root or `agents/`
parent.

The stable `agentId` should make ownership clear across the organization, for
example a bot name or a user-and-runtime combination. The server refuses a
second active collector for the same `(agentId, source)` so two schedulers
cannot silently double-count one stream.

On a machine dedicated to one bot, set the same stable ID for explicit skill
execution reports so telemetry and verified outcomes appear under one name:

```sh
aitk config set agentId <stable-agent-id>
```

If several bots or Hermes profiles share one OS account, do not use this global
default. Set `AITK_AGENT_ID` in each bot process or pass `--agent-id` on both
`report-execution-start` and `report-execution` instead.

The dashboard only sums batches whose complete window falls inside the selected
period. A first-run backfill that crosses the period boundary is shown as an
excluded boundary batch rather than being proportionally estimated and mixed
into a misleading 7-day total.

If a matching legacy pilot checkpoint already exists, `install` adopts its
`collectorInstanceId` automatically. It does not reset or delete the checkpoint,
so the first enrolled upload continues from the last committed window.

Use `--no-schedule` only for an intentional staged install. It enrolls and
stores configuration without sending; `run` remains an explicit action.

## Hermes scope

Hermes uses an explicit SQLite database file and a non-empty profile identity:

```sh
"$HOME/.local/bin/aitk" agent-telemetry install \
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
"$HOME/.local/bin/aitk" agent-telemetry status --agent <id> --source <source>
"$HOME/.local/bin/aitk" agent-telemetry doctor --agent <id> --source <source>
"$HOME/.local/bin/aitk" agent-telemetry run --agent <id> --source <source>
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
"$HOME/.local/bin/aitk" agent-telemetry uninstall --agent <id> --source <source>
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

- Automatic: launchd defaults to every hour (`--interval 3600`). Internal
  agents are always-on, and the dashboard treats a collector as stale after
  two intervals, so hourly keeps agent panels fresh; checkpointed deltas make
  the totals independent of the cadence.
- Agents that run on a person's laptop may pass `--interval 21600` (six hours)
  to limit repeated log scans and network/DB requests. The allowed range is
  600–604800 seconds. This telemetry is separate from human usage: people keep
  reporting once a day through `aitk usage report`. Managed collectors are
  considered stale after two configured intervals, with a twelve-hour floor
  to avoid false alarms from sleeping laptops.
- The macOS job is a per-user LaunchAgent. It does not run while the machine is
  powered off or the GUI user is logged out; `RunAtLoad` catches up from the
  committed checkpoint at the next login. A shorter interval does not change
  that operating-system behavior.
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
