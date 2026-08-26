# Agent telemetry continuous collection

Each launchd job owns exactly one `(agentId, source)` stream and therefore one
checkpoint namespace. The job runs every six hours; the dashboard marks a
reporter stale after twelve hours without a successful batch.

## Security model

- Put the raw agent-scoped credential only in the Mac login Keychain.
- Put only its SHA-256 hash in `AX_AGENT_TELEMETRY_TOKEN_HASHES` on the server.
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
than a directory. The collector opens it read-only and selects only structural
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
