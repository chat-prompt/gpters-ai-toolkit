---
name: agent-telemetry-setup
description: Install, diagnose, run, or remove the GPTers agent telemetry collector on macOS when a user asks to connect Claude Code, Codex, OpenClaw, or Hermes activity to the AX dashboard.
---

# Agent telemetry setup

Use the packaged `aitk` lifecycle commands. The operating-system scheduler owns
the cadence; do not create a cron job, reminder loop, or agent-memory task.

## Boundaries

- Get the user's explicit approval immediately before `install`, `run`, or
  `uninstall`. Diagnosis with `status` or `doctor` is read-only.
- Never ask for or print a collector token. `install` enrolls with the user's
  existing AITK login and stores the returned credential in macOS Keychain.
- Never include transcript text, prompts, responses, commands, raw IDs, project
  paths, or credentials in a report. Report only aggregate health and counts.
- Do not guess a source scope. If the correct directory, project slug, or Hermes
  profile cannot be established, stop before installation.
- Automatic installation currently supports macOS only.

## Install

1. Confirm `aitk --version` is 0.7.0 or newer and `aitk whoami` identifies the
   intended user. If authentication is missing, have the user complete
   `aitk login --device`; do not receive their token in chat.
2. Select one stable, recognizable `agentId` and exactly one source:
   `claude-code`, `codex`, `openclaw`, or `hermes`.
3. Resolve the source scope without reading transcript bodies:
   - Claude Code: the explicit projects directory plus only the intended
     project directory names in `--project-slugs`.
   - Codex: the explicit sessions directory plus only intended workspace names
     in `--project-slugs`.
   - OpenClaw: the explicit agent session directory. Prefer an underlying
     Claude Code source when both represent the same work; never install both
     for overlapping logs.
   - Hermes: an explicit `state.db` and a non-empty `profile_name` dedicated to
     the intended agent. A shared database whose sessions have no stable
     profile identity is not safe to collect.
4. Show the exact command with paths redacted in chat, explain that the first
   run backfills seven days, and get approval. Then run:

```sh
aitk agent-telemetry install \
  --agent <stable-agent-id> \
  --source <source> \
  --sessions-dir <absolute-source-path> \
  --project-slugs <allowed-scope> \
  --days 7
```

Omit `--project-slugs` for OpenClaw. Replace it with
`--hermes-profile <dedicated-profile>` for Hermes. The installer performs a
health-gated dry run before enrollment and registers a six-hour launchd job.

## Verify and operate

Run both commands after installation or after runtime/CLI upgrades:

```sh
aitk agent-telemetry status --agent <id> --source <source>
aitk agent-telemetry doctor --agent <id> --source <source>
```

`doctor` must report `ok: true`; it must not send data or advance a checkpoint.
If the user requests an immediate upload, use `run` once and check the JSON body
for `ok: true`. Do not treat exit code alone as proof of server acceptance.

To remove a collector, run `uninstall` after approval. It revokes the server
credential and removes the scheduler, Keychain item, and local installation
record while preserving the checkpoint for audit/recovery.
