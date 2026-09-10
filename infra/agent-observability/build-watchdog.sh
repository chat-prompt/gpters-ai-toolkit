#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
DESTINATION=${1:?Supply a new private output directory}
REVISION=${2:?Supply the approved full commit SHA}
test "$(git -C "$ROOT" rev-parse HEAD)" = "$REVISION"
test "${#REVISION}" -eq 40
test -z "$(git -C "$ROOT" status --porcelain)"
umask 077
# Refuse reuse rather than overwrite an earlier reviewed bundle.
mkdir "$DESTINATION"
bun build "$ROOT/infra/agent-observability/watch-monitor.ts" --target node --format esm --outfile "$DESTINATION/watch-monitor.mjs"
chmod 600 "$DESTINATION/watch-monitor.mjs"
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");const sha256=crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex");fs.writeFileSync(process.argv[2],JSON.stringify({revision:process.argv[3],sha256}),{mode:0o600,flag:"wx"});console.log(JSON.stringify({revision:process.argv[3],sha256}));' "$DESTINATION/watch-monitor.mjs" "$DESTINATION/build.json" "$REVISION"
