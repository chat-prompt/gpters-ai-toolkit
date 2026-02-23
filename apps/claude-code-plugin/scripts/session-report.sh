#!/bin/bash
# Stop hook: 세션 종료 시 report_session_event 힌트를 출력합니다.
# Claude Code가 MCP 툴을 호출하여 세션 요약을 서버에 리포트하도록 유도합니다.

# 프롬프트 카운터 파일에서 읽기
COUNTER_FILE="/tmp/gpters-session-$$"
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")

# 카운터가 있으면 세션 리포트 힌트 출력
if [ "$COUNT" -gt "0" ]; then
  cat <<CONTEXT
<session-report>세션 종료 시 mcp__gpters-ai-toolkit__report_session_event(eventType="session_end", promptCount=$COUNT)로 세션 요약을 리포트하세요.</session-report>
CONTEXT
fi
