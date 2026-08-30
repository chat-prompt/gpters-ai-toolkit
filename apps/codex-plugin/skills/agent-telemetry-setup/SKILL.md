---
name: agent-telemetry-setup
description: Install, diagnose, run, or remove the GPTers agent telemetry collector on macOS when a user asks to connect Claude Code, Codex, OpenClaw, or Hermes activity to the AX dashboard.
---

# Agent telemetry setup

Use the repo-built `aitk` lifecycle commands from a stable user path. Publishing
or downloading a new npm package is not required for internal agents. The
operating-system scheduler owns the cadence; do not create a cron job, reminder
loop, or agent-memory task.

## Boundaries

- Get the user's explicit approval immediately before installing the repo-built
  CLI or running collector `install`, `run`, or `uninstall`. Diagnosis with
  `status` or `doctor` is read-only.
- Never ask for or print a collector token. `install` enrolls with the user's
  existing AITK login and stores the returned credential in macOS Keychain.
- Never include transcript text, prompts, responses, commands, raw IDs, project
  paths, or credentials in a report. Report only aggregate health and counts.
- Do not guess a source scope. If the correct directory, project slug, or Hermes
  profile cannot be established, stop before installation.
- Automatic installation currently supports macOS only.

## Install

1. In an approved `gpters-ai-toolkit` checkout, pin the requested commit and
   run `sh infra/agent-telemetry/install-from-repo.sh`. Do not use `--force` or
   `--allow-dirty` without separate approval. Confirm
   `"$HOME/.local/bin/aitk" --version` is 0.7.0 or newer, 0.7.1 or newer
   for Hermes default-profile collection, and 0.7.2 or newer for current
   OpenClaw auto-detection and JSONL fallback.
2. Confirm `"$HOME/.local/bin/aitk" whoami` identifies the
   intended user. If authentication is missing, have the user complete
   `"$HOME/.local/bin/aitk" login --device`; do not receive their token in chat.
3. Select one stable, recognizable `agentId` and exactly one source:
   `claude-code`, `codex`, `openclaw`, or `hermes`.
4. Resolve the source scope without reading transcript bodies:
   - Claude Code: the explicit projects directory plus only the intended
     project directory names in `--project-slugs`.
   - Codex: the explicit sessions directory plus only intended workspace names
     in `--project-slugs`.
   - OpenClaw: one explicit internal agent root, its legacy `sessions`
     directory, or its current `agent/openclaw-agent.sqlite`. Supply
     `--openclaw-agent <internal-id>` when known. Never select the shared state
     root or `agents/` parent. Prefer an underlying Claude Code source when both
     represent the same work; never install both for overlapping logs.
   - Hermes: an explicit `state.db` plus one explicit profile scope dedicated
     to the intended agent. Use `--hermes-profile default` for NULL, empty, or
     explicit `default` rows; use the exact profile name for a named profile.
     Treat every profile as a separate agent installation. A default profile
     shared with unrelated local work is not safe to collect.
5. Show the exact command with paths redacted in chat, explain that the first
   run backfills seven days, and get approval. Then run:

```sh
"$HOME/.local/bin/aitk" agent-telemetry install \
  --agent <stable-agent-id> \
  --source <source> \
  --sessions-dir <absolute-source-path> \
  --project-slugs <allowed-scope> \
  --days 7
```

Omit `--project-slugs` for OpenClaw and add `--openclaw-agent <internal-id>`.
The collector prefers the current per-agent SQLite over archived JSONL and
verifies its metadata before collecting. Replace `--project-slugs` with
`--hermes-profile <dedicated-profile-or-default>` for Hermes. The installer performs a
health-gated dry run before enrollment and registers a six-hour launchd job.
For an always-on agent that needs fresher monitoring, add `--interval 3600`;
do not shorten the interval without telling the user.

## Verify and operate

Run both commands after installation or after runtime/CLI upgrades:

```sh
"$HOME/.local/bin/aitk" agent-telemetry status --agent <id> --source <source>
"$HOME/.local/bin/aitk" agent-telemetry doctor --agent <id> --source <source>
```

`doctor` must report `ok: true`; it must not send data or advance a checkpoint.
If the user requests an immediate upload, use `run` once and check the JSON body
for `ok: true`. Do not treat exit code alone as proof of server acceptance.

To remove a collector, run `uninstall` after approval. It revokes the server
credential and removes the scheduler, Keychain item, and local installation
record while preserving the checkpoint for audit/recovery.
