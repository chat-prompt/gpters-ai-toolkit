# Agent telemetry continuous collection

For adding agents or updating a fleet from GitHub, follow the
[rollout protocol](PROTOCOL.md). Keep real ownership and host inventory private.

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
  Hermes skill-load counting (skill_view) requires 0.7.5 or newer, and
  `agent-telemetry upgrade` requires 0.7.6 or newer (0.7.7 for the atomic plist
  swap and pending-batch guard). 0.7.8 carries skill_view calls whose result row
  has not arrived yet across collections, so a late-written result is still
  counted instead of being skipped when the window moves on.
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
the selected credential store, writes a token-free local config, and registers launchd.

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

- `status` checks local configuration, credential availability, and scheduler state.
- `doctor` performs a dry run without uploading or advancing the checkpoint.
- `run` performs one immediate upload using the configured credential store.
- Success is the JSON response body with `ok: true`, not exit code alone.

After a CLI upgrade (for example `install-from-repo.sh` at a newer approved
commit), run `aitk agent-telemetry upgrade --agent <id> --source <source>`.
The installation record and the launchd plist pin the CLI file that was
running at install time (`share/gpters-aitk/<version>/aitk.js`), so replacing
the `aitk` wrapper alone leaves the scheduled job on the old version — batches
keep reporting the old `collectorVersion`. `upgrade` re-points the record and
plist to the running CLI, keeps the collector ID, credential, checkpoint, and
interval, and reloads launchd. It replaces the plist and reloads launchd before
committing the record, so an interrupted upgrade leaves the old record and the
next run repairs it. A pending (unsent) batch blocks the upgrade — run
`agent-telemetry run` first so the health gate can actually re-read the source.
`doctor` reports `cliUpToDate=false` while the record points at another CLI and
`scheduleMatchesRecord=false` while the installed plist differs from the
record; either makes `ok=false`. `cliUpToDate` compares the script path and
version but **not** the node — which node you happened to invoke `doctor` with
says nothing about the installation, and comparing it reported a healthy
collector as `ok=false` whenever `doctor` ran through the wrapper. Whether the
recorded node still exists is covered by `cliExists`, and `scheduledNodePath`
reports which node the scheduled job actually runs. The dashboard
differentiates a registered collector waiting for its first batch, a healthy
reporter, a stale reporter, and a health-blocked reporter.

### Which node the scheduled job runs

`install` and `upgrade` pin an absolute node path into the launchd job, and the
plist carries no `PATH`, so that path is the only one launchd will try. By
default it is the node running the command — which means **the shell you run
`upgrade` from decides what the scheduled collection uses.** A node bundled
inside an agent runtime can be cleaned up later, and collection then stops
silently.

Pass `--node-path` to choose deliberately. It is taken literally, so a symlink
stays a symlink:

```sh
"$HOME/.local/bin/aitk" agent-telemetry upgrade --agent <id> --source <source> \
  --node-path /opt/homebrew/opt/node@24/bin/node
```

Prefer a path that survives patch upgrades (`/opt/homebrew/opt/node@24/...`)
over a version-pinned one (`/opt/homebrew/Cellar/node@24/24.16.0/...`). Without
`--node-path`, `process.execPath` resolves symlinks and the version-pinned form
is what gets recorded. `install-from-repo.sh` pins the wrapper's node the same
way and takes the same choice as `--node`.

  Hermes skill-load counting (skill_view) requires 0.7.5 or newer, and the
  `upgrade` subcommand itself requires 0.7.6 or newer. Batches from an older
  Hermes collector are shown as "skill loads not observed", not as zero.

To remove a stream:

```sh
"$HOME/.local/bin/aitk" agent-telemetry uninstall --agent <id> --source <source>
```

Uninstall revokes the server credential and removes launchd, the Keychain item,
and the local installation record. It preserves the checkpoint for audit and
recovery.

## Security model

- By default the raw collector credential exists only in macOS Keychain and is returned by
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
  reporting once a day through `aitk usage report`.
- Staleness: the dashboard marks a collector stale after
  `max(12 hours, 2 × interval)`. With the hourly default that is twelve hours,
  so the hourly cadence is about data freshness, not faster stale alerts. Managed collectors are
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

## Register on an owner's machine without logging the agent into a personal account

Use a fixed collector ID for both commands. First validate the scoped source on
its machine with `collect --dry-run --collector-id <id>`.

On the owner's already authenticated machine:

```sh
aitk whoami
aitk agent-telemetry authorize --agent example-agent --source claude-code \
  --collector-id <id> --output /private/path/enrollment.json
```

The output file is created exclusively with mode 0600 and contains only a
collector credential, never the owner's user token. Transfer its contents over a
private SSH stdin pipe into the agent machine's command:

```sh
aitk agent-telemetry install --agent example-agent --source claude-code \
  --collector-id <id> --sessions-dir /explicit/claude/projects \
  --project-slugs <approved-project-slug> --days 1 --enrollment-stdin --credential-store file
```

The receiving command validates agent, source, collector, server and interval
against the grant. It never resolves local personal credentials or repeats
owner enrollment. The credential is stored in a private local file with this command; the scheduler runs
independently of personal login. Delete the transfer file after a verified
installation. If remote installation fails, revoke the newly issued collector
from the owner machine via `DELETE /api/ax/agent-telemetry/enroll` with its
collectorId; the unauthenticated agent cannot perform owner revocation. Never
paste the transfer file into chat or pass its credential as a command argument.

### Explicit local credential files

For unattended machines, `install --credential-store file` stores only the scoped
collector token under `~/.config/aitk/credentials/` (directory 0700, file 0600).
It does not require an Apple account or Keychain password. The same OS user and
root can read the file; protect that account and disk accordingly. No token is
placed in the installation config, launchd plist, output, or command arguments.
Keychain remains the default; failures never silently switch storage providers.

After revoking the collector from its owner's machine, remove the local schedule
and credential with `uninstall --agent <id> --source <source> --local-only`.
This needs no personal login, performs no server revocation, and reports
`revoked: false` plus `revocationRequired: true`.

### Codex invoked by an agent

Choose the source from the runtime that writes usage. Hermes using the
`openai-codex` provider is covered by its Hermes collector; do not collect the
same work again as Codex CLI usage. OpenClaw's Codex app-server integration may
write rollouts under its private agent-scoped home. Verify the integration's
actual home and point the collector at that sessions directory explicitly.

For a shared Codex home, cwd alone cannot identify an agent running in `/tmp`.
Mark new `codex exec` calls with `--thread-source aitk-agent:<agent-id>` (verified
with CLI 0.151.0) and select the matching local scope:

```sh
aitk agent-telemetry collect --agent example-agent --source codex \
  --sessions-dir "$HOME/.codex/sessions" \
  --codex-thread-source aitk-agent:example-agent --days 7 --dry-run
```

Only files with exactly matching `session_meta.thread_source` are collected.
Untagged history and other agents' tags are excluded even when cwd is shared.
Project slugs are optional with a tag; if supplied, both restrictions apply,
including the per-turn cwd check. Installation persists the tag and isolates its
checkpoint from legacy cwd-only scopes. A tag is a local attribution convention,
not authentication or protection against a malicious local process.

The `codex-agent-bin/codex` wrapper can be copied to a private agent directory.
Set `AITK_CODEX_AGENT_ID`, the absolute `AITK_CODEX_REAL_BIN`, and prepend that
directory to PATH only for that agent's command and child processes. Existing
scripts calling `codex exec` by name then inherit attribution. Do not modify
global PATH or hard-code one identity in shared skills. Absolute Codex paths
bypass the wrapper; route those through the agent runner. Resuming pre-existing
shared sessions does not migrate their attribution.

Tool-free completed turns are healthy. The `codex-tools-missing` guard is retained
when an observed completed turn contains raw tool calls without supported
completed tool evidence. Live calls are deferred until turn completion. This is not
a guarantee of complete tool coverage: mixed formats and call/result correlation
across windows still require separate verification. These changes require an
updated AITK build on the agent host, not just a dashboard deployment.
