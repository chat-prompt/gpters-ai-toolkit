# Agent telemetry rollout protocol

Protocol version: 1. Applies to repo-built collectors for OpenClaw, Hermes,
Claude Code and Codex. This is an operator/agent procedure, not a new AITK command.
GitHub access alone does not enroll a collector or update a running scheduler.

## Public code, private inventory

This public repository contains reusable adapters, installation scripts, validation
and anonymous examples. Keep real agent IDs, owner/account mappings, hostnames,
SSH addresses, session paths, profile mappings, access approvals and receipts in
private machine configuration or an access-controlled operations repository.
Never commit credentials, enrollment grants, raw transcripts or copied runtime
configuration. Do not paste base64-encoded patches into conversation history;
retrieve reviewed files from an immutable Git commit.

The private inventory must record, per `(agentId, source)`:

- stable agent ID, accountable owner and authorized installation scope;
- host/platform, exact source path, directory allowlist or runtime profile;
- how shared human/agent records are excluded, and which adapter owns each stream;
- approved full commit SHA and expected package version;
- stable Node path, installation prefix, collector ID and interval;
- last locally verified revision and independent server verification time/batch ID.

Use distinct agent IDs for different agents, even when their owner or host is the
same. Give a new source on the same agent its own collector. Never enroll another
agent under an existing agent's ID. Source/path/profile changes are migrations,
not ordinary binary upgrades; review overlap and checkpoint behavior first.

## Select the source by evidence

| Runtime producing the record | Source and isolation boundary |
| --- | --- |
| Hermes, including its `openai-codex` provider | `hermes`: explicit SQLite file plus exact `--hermes-profile` |
| OpenClaw gateway store | `openclaw`: one agent root/store; verify `--openclaw-agent` when known |
| Claude Code used by an agent | `claude-code`: explicit projects root plus allowed project directories |
| Codex app-server used by OpenClaw | `codex`: verified agent-private Codex sessions directory plus allowed cwd names |
| Codex CLI with a shared home | `codex`: explicit `--codex-thread-source aitk-agent:<id>` on new executions and collector |

Do not collect the same work through both a gateway summary and a detailed
runtime adapter. Prefer the detailed runtime transcript when it exposes the
required metrics. Hermes model usage does not require a second Codex collector.
A shared `/tmp` cwd is not proof of ownership. Untagged shared history stays out.
For the process-local Codex wrapper, see [the runtime guide](README.md#codex-invoked-by-an-agent).
Tags are local attribution conventions; server authentication still establishes
which agent/collector may send a batch.

## Retrieve an approved revision

The rollout request supplies a reviewed **40-character commit SHA**, not a moving
branch name. Use a separate clean checkout; do not reset a working checkout.
`REV`, `NODE`, `PREFIX`, `AGENT` and all source paths below are placeholders for
values from the private inventory. This procedure has macOS launchd support;
Linux/Windows automatic scheduling is not implemented by the installer.

```sh
REV='<approved-full-commit-sha>'
NODE='/opt/homebrew/bin/node'
PREFIX="$HOME/.local/opt/agent-telemetry"

git clone https://github.com/chat-prompt/gpters-ai-toolkit.git telemetry-source
cd telemetry-source
git checkout --detach "$REV"
test "$(git rev-parse HEAD)" = "$REV"
test -z "$(git status --porcelain)"

sh infra/agent-telemetry/install-from-repo.sh --prefix "$PREFIX" --node "$NODE"
VERSION=$("$NODE" -p 'require("./apps/aitk-cli/package.json").version')
CLI="$PREFIX/share/gpters-aitk/$VERSION/aitk.js"
"$NODE" "$CLI" --version
```

The installer copies the CLI into a versioned stable path. Use unique versions
for different binary contents; do not use `--force` to replace the contents of a
scheduled version. `--allow-dirty`/`--skip-build` are for separately reviewed
recovery or development; they are not the normal fleet rollout path. Publishing
an npm package is optional and is not part of this protocol.

## Enroll a new agent/source

1. Resolve the private ownership/scope inventory before sending any data. Honor
   existing authorization; do not invent a new permission round for an already
   authorized installation.
2. Use the chosen source flags with `agent-telemetry collect --dry-run`. It must
   read the intended records and exclude other agents. Empty/no-files results
   are not proof of a working source. If necessary, run one authorized small
   real task; do not fabricate transcript fixtures on an operational source.
3. Obtain a collector-specific grant on the **owner's machine**. Keep the owner's
   personal login there. Transfer the grant through a private channel, not Slack
   text or Git. General agent credentials are not owner enrollment permission.
4. Install with the same agent/source/collector ID, source flags, server URL and
   interval used for the grant. Let AITK manage the credential and scheduler.

Owner machine (substitute private inventory values):

```sh
aitk agent-telemetry authorize --agent "$AGENT" --source "$SOURCE" \
  --collector-id "$COLLECTOR" --interval 3600 --output "$PRIVATE_GRANT_FILE"
```

Agent machine, example for a scoped Codex CLI source:

```sh
"$NODE" "$CLI" agent-telemetry install --agent "$AGENT" --source codex \
  --collector-id "$COLLECTOR" --sessions-dir "$SESSIONS_DIR" \
  --codex-thread-source "aitk-agent:$AGENT" --interval 3600 --days 7 \
  --node-path "$NODE" --credential-store file --enrollment-stdin < "$PRIVATE_GRANT_FILE"
```

The grant is a secret; remove the transfer copy after successful installation.
The managed collector credential remains private on the agent host. For another
source, replace only the source/scope flags with the corresponding verified ones.
A duplicate installation error means inspect the existing collector, not create
a new ID and retry. Do not use personal `usage report` as an agent collector.

## Upgrade existing collectors

Install the approved CLI first, then invoke the new CLI once for **each enrolled
source**. Updating a wrapper alone does not change the scheduler's pinned binary.

```sh
"$NODE" "$CLI" agent-telemetry upgrade --agent "$AGENT" --source "$SOURCE" --node-path "$NODE"
```

Upgrade preserves collector ID, credential, checkpoint and interval. If a pending
batch blocks upgrade, flush it with the previously installed working CLI and
retry. If that cannot send, preserve the pending file/ID and diagnose it; do not
remove it to bypass the gate. Do not reinstall or reset the checkpoint as an
upgrade shortcut. Re-running a completed upgrade is safe.

For a new fleet revision, the private rollout request enumerates the affected
hosts/sources. Each host pulls the approved commit and applies this procedure.
There is no unattended polling of GitHub `main`, and adding a new agent to
OpenClaw/Hermes alone does not create its private inventory or authorization.

## Verify and produce evidence

The reusable verifier requires a clean installed manifest matching the approved
commit, the installed binary/version, the requested agent/source, and the pinned
Node path. It checks `doctor.ok`, not merely process exit status. Receipt files
are written with mode0600 in a private directory.

```sh
"$NODE" infra/agent-telemetry/verify-installation.mjs \
  --cli "$CLI" --node "$NODE" --agent "$AGENT" --source "$SOURCE" \
  --revision "$REV" --output "$HOME/.cache/agent-telemetry/receipts/$AGENT-$SOURCE.json"
```

The default command is read-only except for its local receipt. After authorized
installation, add `--send` to request one real report. A successful response with
`inserted:false` acknowledges an already stored batch; it is not a failed upload.
A zero-turn batch verifies transport only, not new activity capture.

**Independent server verification is mandatory before marking rollout complete.**
An operator with dashboard/database read access matches the receipt's exact
batch ID, authenticated agent/source, collector version and totals against stored
data, then checks AX → Skills → Agent activity → Collector status. Verify one
real new task as well as the initial backfill. Calendar-range dashboards can
exclude a backfill crossing their boundary; use a containing range and compare
exact batch evidence rather than expecting identical period totals.

The receipt deliberately keeps `serverIndependentlyVerified:false`: local CLI
acknowledgment cannot prove an independent server check. Store that check as a
separate private operator record. After the next scheduled interval, confirm
another success timestamp without manually triggering a run. Completion states:
`prepared` → `installed` → `local-verified` → `upload-acknowledged` →
`server-verified` → `scheduled-observed`. Report the highest observed state;
never fill in a future state from expectation or from another agent's assertion.

Only share a minimal status summary in the authorized operations thread: state,
version/revision, healthy/blocked, parse failures, batch ID and aggregate counts.
Keep host paths, owner identities, grant contents and raw logs private.

## Recovery and maintenance

- Keep the prior versioned CLI until a scheduled report succeeds. Roll back by
  invoking the prior CLI's `agent-telemetry upgrade`; preserve pending batches.
- Before changing a source path/profile or retiring an agent, review overlap and
  owner revocation. Revoking one source must not remove sibling collectors.
- Repeat scope verification when an integration changes its storage format,
  Codex home isolation, profile name, execution wrapper or auth model.
- Unknown model names, missing skill signals and absent delivery evidence remain
  unknown; do not turn them into zero failures or verified skill successes.
- Collector 0.7.14 restores Codex model, turn and cwd-scope context across offsets.
  Legacy offsets replay metadata once without recounting tokens. Already stored
  unknown-model history is not rewritten.
- Follow [task tracing](TASK_TRACING.md) to instrument individual jobs. Installing
  a collector alone does not attach task context to gateway tool processes.

Run the protocol verifier tests without a server or production data:

```sh
node --test infra/agent-telemetry/verify-installation.test.mjs
```

## Scheduled-task preflight and completion

A collector's healthy report does not establish that a scheduled job has its
execution tools. Before enabling a new or changed job, validate the exact
scheduler entry point, job owner, model/backend, final tool catalogue and stored
finite tool cap. An interactive session on the same host is not a substitute.

1. List the minimal operations required by the job, then compare them with the
   **resolved executable catalogue**, not just the saved `toolsAllow` names.
   Model provider IDs must satisfy the configured model allowlist; a CLI harness
   name is not necessarily an allowed model provider ID. CLI-native tools and
   gateway MCP tools are different surfaces. In a restricted
   Claude invocation, native tools may be empty while gateway tools are exposed
   as `mcp__openclaw__<name>`. Use the actual catalogue names. Codex and Hermes must
   use their own resolved names; do not copy Claude CLI switches to them.
2. Use an inert probe through the same scheduler/backend/owner and tool cap,
   with delivery disabled. Check an actual tool result and process exit, then
   remove the probe. Do not replay a production send or change a job to `*` to
   make a failing probe pass. A pure policy-function test verifies translation,
   but does not prove live MCP connectivity or scheduled execution.
3. A deterministic script can use the runtime's command-job path with an exact
   approved command and execution scope. This avoids depending on an LLM choosing
   a shell tool, but does not grant a missing permission or bypass approval.
4. Preserve scheduler receipt, process outcome, verification and delivery receipt
   separately. Scheduler `ok` may mean the agent turn ended, including an answer
   reporting failure. Missing execution/delivery evidence stays unknown.

`aitk agent-task start` records a task start. `run` additionally records the
wrapped process's execution start and exit; neither automatically asserts the
whole task's completion, verification or delivery. Record an explicit terminal
`task` event only after the defined work is complete. Manual events remain
`self-reported`. A process exit is not a delivery acknowledgment. Existing signal
termination is recorded as failed; there is no distinct cancelled event status.

Task summaries show evidence without opening the timeline. API acknowledgment
for `report-outcome` is an `execution-report`, not proof of successful execution.
The response retains the latest 100 tasks per agent/source within the reporting
period, so a busy stream cannot hide another. The UI applies filters before its
100-task display limit. If earlier tasks were omitted, it discloses that those
records are also outside the failure filter; this is not an all-history incident list.
Registered collectors become stale after two configured intervals, with a minimum
five-minute transport grace. Unregistered schedules retain a 12-hour fallback.
This is evaluated on server query; unattended UI refresh is a separate feature.
