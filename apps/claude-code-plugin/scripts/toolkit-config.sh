#!/bin/bash
# SessionStart hook: 검색 모드 설정 안내

CONFIG_FILE="$HOME/.config/aitk/config.json"
SEARCH_METHOD="auto"
if [ -f "$CONFIG_FILE" ]; then
  METHOD=$(node -e "try{console.log(require('$CONFIG_FILE').searchMethod||'auto')}catch{console.log('auto')}" 2>/dev/null)
  [ -n "$METHOD" ] && SEARCH_METHOD="$METHOD"
fi

AITK_INSTALLED="false"
if command -v aitk &>/dev/null; then
  AITK_INSTALLED="true"
fi

if [ "$AITK_INSTALLED" = "true" ]; then
  cat <<CONTEXT
<toolkit-config>
스킬 검색 모드: ${SEARCH_METHOD} (변경: aitk config set searchMethod <auto|mcp|cli>)
- "auto": MCP 우선, 실패 시 aitk CLI fallback (기본값)
- "mcp": MCP만 사용
- "cli": aitk CLI만 사용
</toolkit-config>
CONTEXT
else
  cat <<CONTEXT
<toolkit-config>
스킬 검색 모드: ${SEARCH_METHOD} (MCP 전용 — aitk CLI 미설치)
aitk CLI를 설치하면 MCP 연결 실패 시 CLI fallback이 가능합니다.
설치: 프로젝트 루트에서 cd apps/aitk-cli && pnpm install && pnpm build && npm link
설치 후 검색 모드 변경: aitk config set searchMethod <auto|mcp|cli>
</toolkit-config>
CONTEXT
fi
