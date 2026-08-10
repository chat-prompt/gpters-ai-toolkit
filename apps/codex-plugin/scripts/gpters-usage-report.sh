#!/bin/bash
# SessionStart hook: AI 클라이언트 사용량을 하루 한 번 집계해 보고합니다.
#
# 집계는 트랜스크립트 전체(수 GB가 될 수 있음)를 훑으므로 세션마다 돌리면 안 되고,
# 훅 타임아웃 안에 끝난다는 보장도 없습니다. 그래서 하루 한 번으로 제한하고
# 백그라운드로 떼어낸 뒤 즉시 반환합니다.
#
# 끄려면: AITK_USAGE_REPORT=0

# 옵트아웃
[ "${AITK_USAGE_REPORT:-1}" = "0" ] && exit 0

STAMP_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/gpters-aitk"
STAMP="$STAMP_DIR/usage-report-last"
TODAY=$(date -u +%Y-%m-%d)

# 오늘 이미 보냈으면 종료.
#
# aitk 탐색보다 먼저 검사한다 — 탐색은 후보마다 프로세스를 띄우므로 수백 ms가 든다.
# 세션마다 그 비용을 치를 이유가 없다.
[ "$(cat "$STAMP" 2>/dev/null)" = "$TODAY" ] && exit 0

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

AITK="$(find_aitk)"

# usage report를 아는 aitk가 없으면 조용히 종료 (report-session.sh와 같은 방침).
# 스탬프를 찍지 않는다 — 업그레이드하면 다음 세션에 바로 잡히게 둔다.
[ -n "$AITK" ] || exit 0

mkdir -p "$STAMP_DIR" 2>/dev/null || exit 0

# 스탬프를 실행 전에 찍는다.
#
# 여러 세션이 동시에 시작되면 같은 집계를 중복 실행하게 되는데, 그게 실패했을 때
# 하루를 건너뛰는 것보다 나쁘다. 구간이 7일 롤링이라 하루 걸러도 다음 날 레코드가
# 그 기간을 덮으므로, 건너뛴 날의 손실은 사실상 없다.
echo "$TODAY" > "$STAMP" 2>/dev/null || exit 0

# node를 찾을 수 있도록 aitk의 bin 디렉터리를 PATH에 얹는다
PATH="$(dirname "$AITK"):$PATH"
export PATH

# 부모 세션이 끝나도 집계가 살아남도록 nohup으로 떼어낸다.
#
# setsid를 쓰지 않는다 — macOS에는 없는데 `( setsid … & )` 형태는 실패해도 exit 0을
# 돌려주므로, 자식이 조용히 죽고 훅은 성공한 것처럼 보인다.
#
# 출력은 버리되 stderr는 남긴다. 이 작업은 아무도 보고 있지 않아서, 로그가 없으면
# 실패했다는 사실 자체를 알 방법이 없다.
LOG="$STAMP_DIR/last-run.log"
nohup "$AITK" usage report --days 7 >/dev/null 2>"$LOG" &

exit 0
