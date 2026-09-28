#!/bin/bash
# SessionStart hook: 하루 한 번, 백그라운드로 두 가지를 합니다.
#   1. aitk 자동 업그레이드 — npm 에 새 버전이 있고 npm 전역 설치본이면 올립니다
#   2. AI 클라이언트 사용량 집계·보고
#
# 집계는 트랜스크립트 전체(수 GB가 될 수 있음)를 훑으므로 세션마다 돌리면 안 되고,
# 훅 타임아웃 안에 끝난다는 보장도 없습니다. 그래서 하루 한 번으로 제한하고
# 백그라운드로 떼어낸 뒤 즉시 반환합니다.
#
# 끄려면: AITK_USAGE_REPORT=0 (사용량 보고), AITK_AUTO_UPDATE=0 (자동 업그레이드)

STAMP_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/gpters-aitk"
STAMP="$STAMP_DIR/usage-report-last"
UPDATE_STAMP="$STAMP_DIR/self-update-last"
TODAY=$(date -u +%Y-%m-%d)

# 후보가 이 스크립트가 필요로 하는 명령을 실제로 지원하는지 확인한다.
#
# 파일 존재나 실행권한만으로는 부족하다:
#   - aitk는 `#!/usr/bin/env node`라 node가 PATH에 없으면 아예 뜨지 않는다
#   - mise shim은 전역 기본 버전이 없으면 "No version is set"으로 죽는다
#   - 버전 매니저를 쓰면 node 버전마다 서로 다른 aitk가 깔려 있을 수 있다
#     (실측: 한 머신에 10개, v0.3.22~v0.5.1 혼재)
#
# `--version`으로 고르지 않는다. 그 문자열은 소스에 하드코딩돼 있어 실제 기능과
# 어긋날 수 있다. 그래서 "usage report를 아는가"를 직접 묻는다.
supports_usage() {
  [ -x "$1" ] || return 1
  PATH="$(dirname "$1"):$PATH" "$1" --help 2>&1 | grep -q "usage report"
}

find_aitk() {
  local candidate

  candidate="$(command -v aitk 2>/dev/null)"
  supports_usage "$candidate" && { echo "$candidate"; return; }

  for candidate in \
    "$HOME"/.local/share/mise/installs/node/*/bin/aitk \
    "$HOME"/.nvm/versions/node/*/bin/aitk \
    "$HOME/.local/share/mise/shims/aitk" \
    "$HOME/.asdf/shims/aitk" \
    "$HOME/.volta/bin/aitk" \
    /opt/homebrew/bin/aitk \
    /usr/local/bin/aitk
  do
    supports_usage "$candidate" && { echo "$candidate"; return; }
  done
}

# aitk 를 npm 최신으로 올린다.
#
# `upgrade --self` 를 아는 aitk 는 스스로 판정한다(npm 전역 설치본일 때만, 더 높은 버전일 때만).
# 모르는 옛 aitk 는 같은 조건을 여기서 확인하고 한 번 올린다 — 그다음부터는 새 aitk 가 한다.
# npm link 개발본, npx·저장소 빌드(사내 에이전트), 쓰기 권한 없는 전역 경로는 건드리지 않는다.
self_update() {
  if "$AITK" upgrade --help 2>&1 | grep -q -- '--self'; then
    "$AITK" upgrade --self
    return
  fi

  local npm_bin root pkg real_aitk real_pkg
  npm_bin="$(dirname "$AITK")/npm"
  [ -x "$npm_bin" ] || npm_bin=npm
  root="$("$npm_bin" root -g 2>/dev/null)"
  [ -n "$root" ] || { echo "npm 전역 경로를 알 수 없어 건너뜀"; return 0; }
  pkg="$root/@gpters/aitk"
  [ -L "$pkg" ] && { echo "npm link 개발본이라 건너뜀"; return 0; }

  real_aitk="$(node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "$AITK" 2>/dev/null)"
  real_pkg="$(node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "$pkg" 2>/dev/null)"
  case "$real_aitk" in
    "$real_pkg"/*) [ -n "$real_pkg" ] || { echo "npm 전역 설치본이 아니라 건너뜀"; return 0; } ;;
    *) echo "npm 전역 설치본이 아니라 건너뜀"; return 0 ;;
  esac
  [ -w "$root" ] || { echo "npm 전역 경로에 쓰기 권한이 없어 건너뜀"; return 0; }

  "$npm_bin" install -g @gpters/aitk@latest --no-fund --no-audit
}

# 백그라운드 작업 — 아래 본문이 nohup 으로 이 스크립트를 다시 부른다.
#
# 업그레이드를 먼저 한다. 같은 경로의 aitk 가 새 버전으로 바뀌므로 이어지는 보고는
# 새 수집기로 돈다. 출력은 버리되 stderr·결과는 남긴다 — 아무도 보고 있지 않은 작업이라
# 로그가 없으면 실패했다는 사실 자체를 알 방법이 없다.
if [ "${1:-}" = "--aitk-background" ]; then
  if [ "${AITK_BG_UPDATE:-0}" = "1" ]; then
    { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] aitk 자동 업그레이드"; self_update; } >"$STAMP_DIR/self-update.log" 2>&1
  fi
  if [ "${AITK_BG_REPORT:-0}" = "1" ]; then
    "$AITK" usage report --days 7 >/dev/null 2>"$STAMP_DIR/last-run.log"
  fi
  exit 0
fi

# 옵트아웃과 오늘 이미 한 일을 먼저 거른다.
#
# aitk 탐색보다 먼저 검사한다 — 탐색은 후보마다 프로세스를 띄우므로 수백 ms가 든다.
# 세션마다 그 비용을 치를 이유가 없다.
REPORT=1
UPDATE=1
[ "${AITK_USAGE_REPORT:-1}" = "0" ] && REPORT=0
[ "${AITK_AUTO_UPDATE:-1}" = "0" ] && UPDATE=0
[ "$(cat "$STAMP" 2>/dev/null)" = "$TODAY" ] && REPORT=0
[ "$(cat "$UPDATE_STAMP" 2>/dev/null)" = "$TODAY" ] && UPDATE=0
[ "$REPORT$UPDATE" = "00" ] && exit 0

AITK="$(find_aitk)"

# usage report를 아는 aitk가 없으면 조용히 종료 (report-session.sh와 같은 방침).
# 스탬프를 찍지 않는다 — 업그레이드하면 다음 세션에 바로 잡히게 둔다.
[ -n "$AITK" ] || exit 0

mkdir -p "$STAMP_DIR" 2>/dev/null || exit 0

# 스탬프를 실행 전에 찍는다.
#
# 여러 세션이 동시에 시작되면 같은 작업을 중복 실행하게 되는데, 그게 실패했을 때
# 하루를 건너뛰는 것보다 나쁘다. 보고는 구간이 7일 롤링이라 하루 걸러도 다음 날 레코드가
# 그 기간을 덮고, 업그레이드는 다음 날 다시 시도하면 된다.
[ "$REPORT" = "1" ] && { echo "$TODAY" > "$STAMP" 2>/dev/null || REPORT=0; }
[ "$UPDATE" = "1" ] && { echo "$TODAY" > "$UPDATE_STAMP" 2>/dev/null || UPDATE=0; }
[ "$REPORT$UPDATE" = "00" ] && exit 0

# node를 찾을 수 있도록 aitk의 bin 디렉터리를 PATH에 얹는다
PATH="$(dirname "$AITK"):$PATH"
export PATH AITK

# 부모 세션이 끝나도 작업이 살아남도록 nohup으로 떼어낸다.
#
# setsid를 쓰지 않는다 — macOS에는 없는데 `( setsid … & )` 형태는 실패해도 exit 0을
# 돌려주므로, 자식이 조용히 죽고 훅은 성공한 것처럼 보인다.
AITK_BG_REPORT="$REPORT" AITK_BG_UPDATE="$UPDATE" nohup /bin/bash "$0" --aitk-background >/dev/null 2>&1 &

exit 0
