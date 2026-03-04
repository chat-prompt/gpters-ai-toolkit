#!/bin/bash
# UserPromptSubmit hook: 매 프롬프트마다 경량 힌트를 주입합니다.
# 실제 검색 여부는 Claude가 대화 맥락을 보고 판단합니다.

# 프롬프트 카운터 증가 (세션 리포트용)
# PPID = Claude Code 프로세스 PID (셸 스크립트는 매번 새 PID이므로 $$ 사용 불가)
COUNTER_FILE="/tmp/gpters-session-${PPID}"
COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
echo $((COUNT + 1)) > "$COUNTER_FILE"

# ~/.config/aitk/config.json에서 searchMethod 읽기 (mcp | cli | auto)
CONFIG_FILE="$HOME/.config/aitk/config.json"
SEARCH_METHOD="auto"
if [ -f "$CONFIG_FILE" ]; then
  METHOD=$(node -e "try{console.log(require('$CONFIG_FILE').searchMethod||'auto')}catch{console.log('auto')}" 2>/dev/null)
  [ -n "$METHOD" ] && SEARCH_METHOD="$METHOD"
fi

# 검색 모드에 따라 힌트 주입
case "$SEARCH_METHOD" in
  mcp)
    cat <<'CONTEXT'
<team-skills>새 작업/주제 변경 시 팀 스킬을 검색하세요. 기존 대화의 후속이면 무시하세요.
검색: mcp__gpters-ai-toolkit__semantic_search(query="핵심 키워드 2~4단어", userContext="작업 맥락(있으면)", limit=3, _source="skill-suggest")
MCP 연결 불가 시 검색을 건너뛰세요.
규칙: 0.40 이상→get_plugin_content로 로드, 미만→report_search_skip으로 스킵 보고.
적용 후: report_skill_outcome으로 결과 보고. 상세 절차는 skill-suggest SKILL.md 참조.</team-skills>
CONTEXT
    ;;
  cli)
    cat <<'CONTEXT'
<team-skills>새 작업/주제 변경 시 팀 스킬을 검색하세요. 기존 대화의 후속이면 무시하세요.
검색: Bash("aitk search '핵심 키워드 2~4단어' --limit 3 --context '작업 맥락(있으면)'")
규칙: 0.40 이상→Bash("aitk get '스킬ID'")로 로드, 미만→Bash("aitk report-skip --query '검색어' --reason '사유'")로 스킵 보고.
적용 후: Bash("aitk report-outcome --skill-id '스킬ID' --applied true --summary '결과'")로 보고. 상세 절차는 skill-suggest SKILL.md 참조.</team-skills>
CONTEXT
    ;;
  *)
    # auto: MCP 우선, 불가 시 CLI fallback (기본 동작)
    cat <<'CONTEXT'
<team-skills>새 작업/주제 변경 시 팀 스킬을 검색하세요. 기존 대화의 후속이면 무시하세요.
검색: mcp__gpters-ai-toolkit__semantic_search(query="핵심 키워드 2~4단어", userContext="작업 맥락(있으면)", limit=3, _source="skill-suggest")
MCP 연결 불가 시: Bash("aitk search '키워드' --limit 3") 로 fallback
규칙: 0.40 이상→get_plugin_content로 로드, 미만→report_search_skip으로 스킵 보고.
적용 후: report_skill_outcome으로 결과 보고. 상세 절차는 skill-suggest SKILL.md 참조.</team-skills>
CONTEXT
    ;;
esac
