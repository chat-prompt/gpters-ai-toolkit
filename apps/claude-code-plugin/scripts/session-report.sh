#!/bin/bash
# SessionEnd hook: 대화가 끝난 뒤 transcript에서 사용자 입력 수만 계산합니다.
# Node 진입점은 즉시 분리된 worker를 띄우므로 Claude의 종료를 기다리게 하지 않습니다.
# 훅은 셸 프로필 없이 실행돼 mise/nvm/volta 사용자의 PATH에 node가 없을 수 있다.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  local candidate
  for candidate in \
    "$HOME/.local/share/mise/shims/node" \
    "$HOME/.asdf/shims/node" \
    "$HOME/.volta/bin/node" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME"/.local/share/mise/installs/node/*/bin/node \
    "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

NODE="$(find_node)"
[ -n "$NODE" ] || exit 0
# PATH는 건드리지 않는다. node 디렉터리를 앞에 붙이면 같은 디렉터리의 전역 aitk가
# 워커의 탐색 순서를 바꾼다 (테스트 스텁·사용자 PATH보다 먼저 잡힌다).
"$NODE" "$SCRIPT_DIR/session-report.mjs" >/dev/null 2>&1 || true
exit 0
