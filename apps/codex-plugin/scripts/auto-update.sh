#!/bin/bash
# Codex 플러그인 자동 업데이트
#
# npm 퍼블릭 레지스트리에서 최신 버전을 확인하고,
# 로컬 버전보다 새로우면 자동으로 업데이트를 수행한다.
#
# 사용법: bash ~/.agents/auto-update.sh

set -euo pipefail

SKILLS_DIR="${HOME}/.agents/skills/gpters"
VERSION_FILE="${SKILLS_DIR}/.version"
REGISTRY="https://registry.npmjs.org"
PACKAGE="@gpters/codex-plugin"

# 로컬 버전 파일이 없으면 (수동 설치 등) 종료
[ -f "$VERSION_FILE" ] || exit 0
LOCAL_VER=$(cat "$VERSION_FILE")

# npm에서 최신 버전 조회 (5초 타임아웃, 실패 시 무시)
REMOTE_VER=$(curl -sf --max-time 5 "${REGISTRY}/${PACKAGE}" 2>/dev/null \
  | node -e "
    let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{try{console.log(JSON.parse(d)['dist-tags'].latest)}catch{}})" 2>/dev/null) || true

# 원격 버전을 가져올 수 없거나 동일하면 종료
[ -z "$REMOTE_VER" ] && exit 0
[ "$REMOTE_VER" = "$LOCAL_VER" ] && exit 0

# 업데이트 실행 (백그라운드, 실패해도 세션 차단 안 함)
echo "[GPTers] Codex Plugin 업데이트 중: v${LOCAL_VER} → v${REMOTE_VER}"
npx "${PACKAGE}@${REMOTE_VER}" setup --scope user --force 2>/dev/null \
  && echo "[GPTers] 업데이트 완료. 다음 세션부터 적용됩니다." \
  || echo "[GPTers] 업데이트 실패. 수동 실행: npx ${PACKAGE} setup --force"
