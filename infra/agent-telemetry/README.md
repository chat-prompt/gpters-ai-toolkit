# Agent telemetry continuous collection

Each launchd job owns exactly one `(agentId, source)` stream and therefore one
checkpoint namespace. The job runs every six hours; the dashboard marks a
reporter stale after twelve hours without a successful batch.

## Security model

- Put the raw agent-scoped credential only in the Mac login Keychain.
- Put only its SHA-256 hash on the server. Keep the initial JSON map in
  `AX_AGENT_TELEMETRY_TOKEN_HASHES`; add later reporters independently as
  `AX_AGENT_TELEMETRY_TOKEN_HASH_<AGENT_ID>` (for example,
  `AX_AGENT_TELEMETRY_TOKEN_HASH_CODEX`). Uppercase underscores in the variable
  suffix map to lowercase hyphens in `agentId`.
- When scoped hashes are configured, the legacy shared token is disabled.
- The server rejects a scoped credential if the payload `agentId` differs.
- Transcript text, prompts, responses, commands, paths, IDs, and credentials
  are never sent.

## One-time setup on an agent Mac

1. Build the CLI and run one `--dry-run` with explicit `--sessions-dir` and
   source scope. Confirm `healthStatus=healthy` and the record counters sum to
   `recordsRead`.
2. Add the scoped credential to Keychain without placing it on the command
   line:

   ```sh
   security add-generic-password -a "$USER" -s gpters-agent-telemetry-prod -w -U
   ```

3. Copy `com.gpters.agent-telemetry.example.plist` into
   `~/Library/LaunchAgents`, replace every placeholder, and create the log
   directory first. Do not put a token in the plist.
4. Validate and load it:

   ```sh
   plutil -lint ~/Library/LaunchAgents/com.gpters.agent-telemetry.AGENT.SOURCE.plist
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.gpters.agent-telemetry.AGENT.SOURCE.plist
   launchctl kickstart -k "gui/$(id -u)/com.gpters.agent-telemetry.AGENT.SOURCE"
   ```

Use a separate plist for Claude Code, Codex, or Hermes. Do
not point OpenClaw and Claude Code collectors at overlapping source logs: that
would double-count the same work. OpenClaw gateway summaries also do not expose
reliable tool or skill activity, so prefer the underlying runtime transcript
when it exists.

For Hermes, `AITK_SESSIONS_DIR` is the explicit SQLite database file rather
than a directory. The default profile uses `~/.hermes/state.db`; a named Hermes
profile has its own home and must point at that profile's `state.db`. Prefer a
dedicated agent profile so a bot batch cannot include a person's unrelated
Hermes sessions. Verify the exact profile on the Hermes machine before the
first upload:

```sh
aitk agent-telemetry collect \
  --agent <stable-agent-id> \
  --source hermes \
  --sessions-dir "$HOME/.hermes/state.db" \
  --days 7 \
  --category unclassified \
  --dry-run
```

The collector opens it read-only and selects only structural
columns. Session usage is converted from cumulative counters to checkpointed
deltas; turns come from user-role messages and tools from stable call IDs.
Message content, reasoning text, tool arguments, paths, and raw IDs are never
written to the checkpoint or batch. Hermes reasoning/output inclusion is not
yet proven, so its relation remains `unknown` and the dashboard does not add it
again to total processed tokens.

## Operational checks

- `reporting`: latest successful batch is at most 12 hours old.
- `stale`: check the launchd job, Keychain access, and pending checkpoint.
- `missing`: collector exists but that source has not reported in the selected
  period.
- A failed upload keeps the pending batch and retries the same `batchId`; server
  idempotency prevents double counting.

## Review cadence

- Automatic: collect every 6 hours and treat a reporter as stale after 12
  hours. A quiet interval may legitimately contain a healthy zero-delta batch.
- Daily: check reporter freshness, source coverage, parse failures, and pending
  checkpoints. Fix collection health before interpreting usage trends.
- Weekly: review the 7-day dashboard for context tokens per turn, reasoning
  share, model mix, and tool failure hotspots. The dashboard calls out context
  above 100k tokens/turn, reasoning above 30% of output, and tools with at least
  10 calls and a 5% failure rate.
- Rollout: add one `(agentId, source)` stream at a time, independently compare
  its first backfill with the source of truth, then keep the same checkpoint.
  Never reset a valid checkpoint to make a graph look cleaner.
