#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
DESTINATION=${1:-"$ROOT/.local/agent-reports"}
umask 077
mkdir -p "$DESTINATION"
bun build "$ROOT/infra/agent-reports/report.ts" --target node --format esm --outfile "$DESTINATION/report.mjs"
bun build "$ROOT/infra/agent-reports/identity.ts" --target node --format esm --outfile "$DESTINATION/identity.mjs"
bun build "$ROOT/infra/agent-reports/slack-reaction.ts" --target node --format esm --outfile "$DESTINATION/slack-reaction.mjs"
bun build "$ROOT/infra/agent-reports/inbox.ts" --target node --format esm --outfile "$DESTINATION/inbox.mjs"
printf '%s\n' "Built helper: $DESTINATION/report.mjs"
