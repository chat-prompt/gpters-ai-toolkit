#!/bin/sh

# Install the repo-built AITK CLI into a versioned, stable user path.
# This deliberately does not enroll a collector; enrollment remains a separate,
# explicitly approved `aitk agent-telemetry install` action.

set -eu

usage() {
  cat <<'EOF'
Usage: install-from-repo.sh [options]

Options:
  --repo-root <path>  gpters-ai-toolkit checkout (default: inferred from script)
  --prefix <path>     install prefix (default: $HOME/.local)
  --skip-build        use the existing apps/aitk-cli/dist/bin/aitk.js
  --allow-dirty       allow building with telemetry-related source changes
  --force             replace an unmanaged wrapper or changed same-version binary
  --help              show this help

The installed CLI lives at:
  <prefix>/share/gpters-aitk/<version>/aitk.js
  <prefix>/bin/aitk
EOF
}

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
prefix=${HOME:?HOME must be set}/.local
skip_build=0
allow_dirty=0
force=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-root)
      [ "$#" -ge 2 ] || { echo "error: --repo-root requires a path" >&2; exit 2; }
      repo_root=$2
      shift 2
      ;;
    --prefix)
      [ "$#" -ge 2 ] || { echo "error: --prefix requires a path" >&2; exit 2; }
      prefix=$2
      shift 2
      ;;
    --skip-build)
      skip_build=1
      shift
      ;;
    --allow-dirty)
      allow_dirty=1
      shift
      ;;
    --force)
      force=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root=$(CDPATH= cd -- "$repo_root" && pwd)
package_json=$repo_root/apps/aitk-cli/package.json
source_cli=$repo_root/apps/aitk-cli/dist/bin/aitk.js

[ -f "$package_json" ] || { echo "error: AITK package not found under $repo_root" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "error: node is required" >&2; exit 1; }

version=$(node -e 'const p = require(process.argv[1]); process.stdout.write(String(p.version || ""))' "$package_json")
case "$version" in
  ''|*[!0-9A-Za-z._-]*)
    echo "error: invalid AITK package version" >&2
    exit 1
    ;;
esac

if [ "$skip_build" -eq 0 ]; then
  command -v git >/dev/null 2>&1 || { echo "error: git is required for a source build" >&2; exit 1; }
  command -v corepack >/dev/null 2>&1 || { echo "error: corepack is required for a source build" >&2; exit 1; }
  if [ "$allow_dirty" -eq 0 ]; then
    build_input_status=$(git -C "$repo_root" status --porcelain --untracked-files=all -- \
      apps/aitk-cli/bin apps/aitk-cli/src apps/aitk-cli/package.json \
      packages/lib/src/features/ax/agent-telemetry-contract.ts)
    if [ -n "$build_input_status" ]; then
      echo "error: telemetry build inputs are dirty; commit them or pass --allow-dirty" >&2
      exit 1
    fi
  fi

  if [ ! -d "$repo_root/node_modules/.pnpm" ]; then
    corepack pnpm --dir "$repo_root" install --frozen-lockfile
  fi
  if command -v bun >/dev/null 2>&1; then
    corepack pnpm --dir "$repo_root" --filter @gpters/aitk build
  else
    echo "notice: bun is not installed; using pinned bun@1.4.0 for this repo build"
    corepack pnpm dlx bun@1.4.0 run --cwd "$repo_root/apps/aitk-cli" build
  fi
fi

[ -f "$source_cli" ] || {
  echo "error: built AITK CLI is missing; run without --skip-build" >&2
  exit 1
}

actual_version=$(node "$source_cli" --version 2>&1 || true)
[ "$actual_version" = "aitk v$version" ] || {
  echo "error: built CLI version does not match package.json" >&2
  exit 1
}

install_dir=$prefix/share/gpters-aitk/$version
target_cli=$install_dir/aitk.js
manifest=$install_dir/manifest.json
bin_dir=$prefix/bin
wrapper=$bin_dir/aitk
marker='managed-by: gpters-ai-toolkit install-from-repo'

mkdir -p "$install_dir" "$bin_dir"

if [ -e "$wrapper" ] || [ -L "$wrapper" ]; then
  if ! grep -q "$marker" "$wrapper" 2>/dev/null && [ "$force" -ne 1 ]; then
    echo "error: $wrapper exists and is not managed by this installer; pass --force to replace it" >&2
    exit 1
  fi
fi

if [ -f "$target_cli" ] && ! cmp -s "$source_cli" "$target_cli" && [ "$force" -ne 1 ]; then
  echo "error: AITK $version is already installed with a different binary; bump the version or pass --force" >&2
  exit 1
fi

target_tmp=$target_cli.tmp.$$
manifest_tmp=$manifest.tmp.$$
wrapper_tmp=$wrapper.tmp.$$
cleanup() {
  rm -f "$target_tmp" "$manifest_tmp" "$wrapper_tmp"
}
trap cleanup EXIT HUP INT TERM

install -m 755 "$source_cli" "$target_tmp"
mv -f "$target_tmp" "$target_cli"

source_commit=$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || printf 'unknown')
source_dirty=false
if git -C "$repo_root" status --porcelain --untracked-files=all -- \
     apps/aitk-cli/bin apps/aitk-cli/src apps/aitk-cli/package.json \
     packages/lib/src/features/ax/agent-telemetry-contract.ts 2>/dev/null | grep -q .; then
  source_dirty=true
fi
printf '{\n  "version": "%s",\n  "sourceCommit": "%s",\n  "sourceDirty": %s\n}\n' \
  "$version" "$source_commit" "$source_dirty" > "$manifest_tmp"
chmod 644 "$manifest_tmp"
mv -f "$manifest_tmp" "$manifest"

cat > "$wrapper_tmp" <<EOF
#!/bin/sh
# $marker
prefix_dir=\$(CDPATH= cd -- "\$(dirname -- "\$0")/.." && pwd)
exec node "\$prefix_dir/share/gpters-aitk/$version/aitk.js" "\$@"
EOF
chmod 755 "$wrapper_tmp"
mv -f "$wrapper_tmp" "$wrapper"

trap - EXIT HUP INT TERM

echo "installed: aitk v$version"
echo "binary: $target_cli"
echo "command: $wrapper"
echo "source commit: $source_commit"
case ":${PATH:-}:" in
  *":$bin_dir:"*) ;;
  *) echo "notice: add $bin_dir to PATH before running aitk" ;;
esac
