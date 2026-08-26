#!/bin/zsh
# launchd에서 한 source의 agent telemetry를 안전하게 한 번 수집한다.

set -euo pipefail
umask 077

: "${AITK_AGENT_ID:?AITK_AGENT_ID is required}"
: "${AITK_TELEMETRY_SOURCE:?AITK_TELEMETRY_SOURCE is required}"
: "${AITK_SESSIONS_DIR:?AITK_SESSIONS_DIR is required}"
: "${AITK_CLI_JS:?AITK_CLI_JS is required}"

case "$AITK_TELEMETRY_SOURCE" in
  openclaw|claude-code|codex|hermes) ;;
  *) print -u2 "unsupported telemetry source"; exit 64 ;;
esac

if [[ "$AITK_TELEMETRY_SOURCE" != "openclaw" && "$AITK_TELEMETRY_SOURCE" != "hermes" && -z "${AITK_PROJECT_SLUGS:-}" ]]; then
  print -u2 "AITK_PROJECT_SLUGS is required for this telemetry source"
  exit 64
fi

keychain_service="${AITK_KEYCHAIN_SERVICE:-gpters-agent-telemetry-prod}"
keychain_account="${AITK_KEYCHAIN_ACCOUNT:-$(/usr/bin/id -un)}"
telemetry_token="$(/usr/bin/security find-generic-password -a "$keychain_account" -s "$keychain_service" -w)"
if [[ -z "$telemetry_token" ]]; then
  print -u2 "agent telemetry credential is unavailable"
  exit 78
fi

command=(
  /usr/bin/env node "$AITK_CLI_JS" agent-telemetry collect
  --agent "$AITK_AGENT_ID"
  --source "$AITK_TELEMETRY_SOURCE"
  --sessions-dir "$AITK_SESSIONS_DIR"
  --days "${AITK_BACKFILL_DAYS:-7}"
  --category "${AITK_TASK_CATEGORY:-unclassified}"
  --server-url "${AITK_SERVER_URL:-https://ai-toolkit.gpters.org}"
)

if [[ -n "${AITK_PROJECT_SLUGS:-}" ]]; then
  command+=(--project-slugs "$AITK_PROJECT_SLUGS")
fi
if [[ -n "${AITK_CHECKPOINT_DIR:-}" ]]; then
  command+=(--checkpoint-dir "$AITK_CHECKPOINT_DIR")
fi
if [[ -n "${AITK_COLLECTOR_ID:-}" ]]; then
  command+=(--collector-id "$AITK_COLLECTOR_ID")
fi

export AX_AGENT_TELEMETRY_TOKEN="$telemetry_token"
exec "${command[@]}"
