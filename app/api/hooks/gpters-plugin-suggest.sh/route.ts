import { NextResponse } from 'next/server'

const HOOK_SCRIPT = `#!/bin/bash
# GPTers Plugin Auto-Suggestion Hook
# UserPromptSubmit 이벤트에서 실행되어 관련 MCP 플러그인을 자동으로 제안합니다.

# 환경변수
MCP_URL="\${GPTERS_MCP_URL:-https://company-ai-toolkit.vercel.app/api/mcp}"
MCP_TOKEN="\${GPTERS_MCP_TOKEN:-}"

# 토큰 없으면 종료
if [ -z "$MCP_TOKEN" ]; then
    exit 0
fi

# 사용자 입력
USER_PROMPT="\${prompt:-}"

if [ -z "$USER_PROMPT" ]; then
    exit 0
fi

# MCP 서버에 검색 요청 (Simple REST API)
RESPONSE=$(curl -s -X POST "\${MCP_URL}?action=search" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer \${MCP_TOKEN}" \\
    -d "{\\"query\\": \\"$USER_PROMPT\\"}" 2>/dev/null)

# 결과 파싱 (jq 필요)
if command -v jq &> /dev/null; then
    PLUGINS=$(echo "$RESPONSE" | jq -r '.plugins // [] | .[0:3] | .[].id' 2>/dev/null | tr '\\n' ', ' | sed 's/,$//')

    if [ -n "$PLUGINS" ] && [ "$PLUGINS" != "null" ]; then
        echo ""
        echo "💡 관련 GPTers 플러그인: $PLUGINS"
        echo "   /mcp__gpters-marketplace__<plugin-id> 로 사용하거나 자연어로 요청하세요."
    fi
fi
`

export async function GET() {
  return new NextResponse(HOOK_SCRIPT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gpters-plugin-suggest.sh"',
    },
  })
}
