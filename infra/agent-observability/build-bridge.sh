#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
DESTINATION=${1:?Supply a private output directory}
umask 077
mkdir -p "$DESTINATION"
bun build "$ROOT/infra/agent-observability/bridge.mjs" --target node --format esm --outfile "$DESTINATION/observation-bridge.mjs"
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex")+"\n")' "$DESTINATION/observation-bridge.mjs"
