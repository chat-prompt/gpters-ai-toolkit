#!/bin/bash
# UserPromptSubmit hook: 매 세션 첫 프롬프트에서 팀 스킬 검색을 안내합니다.
# stdin으로 { "prompt": "..." } JSON을 수신하고,
# stdout으로 Claude에게 MCP 스킬 검색을 지시하는 컨텍스트를 주입합니다.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# 짧은 프롬프트는 skip (인사, 단순 명령 등)
if [ ${#PROMPT} -lt 15 ]; then
  exit 0
fi

# 세션당 1회만 실행 (CLAUDE_SESSION_ID 기반 마커)
MARKER="/tmp/claude-skill-searched-${CLAUDE_SESSION_ID:-default}"
if [ -f "$MARKER" ]; then
  exit 0
fi
touch "$MARKER"

cat <<'CONTEXT'
[GPTers AI Toolkit] 작업 시작 전, 관련 팀 스킬을 검색하세요:
1. mcp__gpters-ai-toolkit__semantic_search(query="핵심 키워드", limit=3) 호출
2. 관련 스킬이 있으면 get_plugin_content로 로드 후 가이드라인 적용
3. 없으면 일반적으로 진행
CONTEXT

exit 0
