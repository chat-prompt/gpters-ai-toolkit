#!/bin/bash
# Stop hook: 세션 종료 시 report_session_event를 직접 HTTP로 호출합니다.
# Claude Code의 Stop 훅은 세션 종료 시점이라 MCP 툴 호출 불가 → curl 직접 호출.
# 인증 토큰을 찾을 수 없으면 힌트 출력으로 graceful fallback.

# 프롬프트 카운터 파일에서 읽기
# PPID = Claude Code 프로세스 PID (skill-search.sh와 동일한 파일 참조)
COUNTER_FILE="/tmp/gpters-session-${PPID}"
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")

# 리포트할 내용이 없으면 조기 종료
if [ "$COUNT" -le "0" ]; then
  rm -f "$COUNTER_FILE"
  exit 0
fi

# 플러그인 버전 읽기
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SCRIPT_DIR/../.claude-plugin/plugin.json" 2>/dev/null | head -1 | grep -o '[0-9][0-9.]*')
PLUGIN_VERSION="${PLUGIN_VERSION:-unknown}"

# MCP 서버 엔드포인트
MCP_URL="https://ai-toolkit.gpters.org/api/mcp"

# Claude Code의 MCP OAuth 토큰 탐색 (best-effort)
# 실제 토큰 위치: ~/.claude/.credentials.json > mcpOAuth > "plugin:gpters-ai-toolkit:*" or "gpters-ai-toolkit|*"
TOKEN=""
CRED_FILE="$HOME/.claude/.credentials.json"

if [ -f "$CRED_FILE" ] && command -v jq >/dev/null 2>&1; then
  # mcpOAuth 내에서 gpters-ai-toolkit 관련 키의 accessToken을 탐색
  TOKEN=$(jq -r '
    .mcpOAuth // {} | to_entries[]
    | select(.key | test("gpters-ai-toolkit"))
    | select((.value.accessToken | length) > 0)
    | .value.accessToken
  ' "$CRED_FILE" 2>/dev/null | head -1)
fi

# 환경변수 fallback
[ -z "$TOKEN" ] && TOKEN="${MCP_ACCESS_TOKEN:-}"

# 토큰이 있으면 직접 JSON-RPC 호출
if [ -n "$TOKEN" ]; then
  curl -s --max-time 5 -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"report_session_event","arguments":{"eventType":"session_end","promptCount":'"$COUNT"',"pluginVersion":"'"$PLUGIN_VERSION"'"}}}' \
    >/dev/null 2>&1 &
fi

# Fallback: 항상 힌트도 출력 (토큰 호출 실패 시 Claude가 처리할 수 있도록)
cat <<'CONTEXT'
<session-report>
report_session_event를 호출하세요.

■ 호출 파라미터:
  eventType: "session_end"
CONTEXT
echo "  promptCount: $COUNT"
echo "  pluginVersion: \"$PLUGIN_VERSION\""
cat <<'CONTEXT'
</session-report>
CONTEXT

# 카운터 파일 정리
rm -f "$COUNTER_FILE"
