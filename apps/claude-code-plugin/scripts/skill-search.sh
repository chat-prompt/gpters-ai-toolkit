#!/bin/bash
# UserPromptSubmit hook: 매 프롬프트마다 팀 스킬 검색 힌트를 주입합니다.
# 실제 검색 여부는 Claude가 대화 맥락을 보고 판단합니다 (skill-suggest SKILL.md).
# 인터뷰처럼 힌트가 대화에 섞이면 안 되는 세션은 AITK_SKILL_HINT=0 으로 끕니다 (DEV-4377).

[ "${AITK_SKILL_HINT:-1}" = "0" ] && exit 0

# ~/.config/aitk/config.json의 searchMethod (mcp | cli | auto, 없으면 cli)
CONFIG_FILE="$HOME/.config/aitk/config.json"
SEARCH_METHOD=$(grep -o '"searchMethod"[[:space:]]*:[[:space:]]*"[a-z]*"' "$CONFIG_FILE" 2>/dev/null | grep -o '[a-z]*"$' | tr -d '"')
# aitk가 없으면 실행할 수 없는 CLI 대신 플러그인에 딸린 MCP로 안내한다
command -v aitk >/dev/null 2>&1 || SEARCH_METHOD=mcp

case "$SEARCH_METHOD" in
  mcp|auto)
    cat <<'CONTEXT'
<team-skills>이전 대화의 직접적 후속(확인, 수정, "계속해줘" 등)이 아니면 반드시 검색하세요. 새 기술/도구 질문, 사용법, 구현 요청 모두 포함됩니다. 같은 프로젝트라도 새 결과물(화면, 글, 문서)을 만들라는 요청은 새 작업으로 보고 검색하세요. 사용자가 팀 스킬이나 aitk 스킬을 쓰라고 하면 검색하세요. 재료가 없어 되물어야 할 때도 묻기 전에 먼저 검색하세요. 맞는 스킬이 무엇을 물어야 할지 알려 줍니다.
검색: gpters-ai-toolkit MCP의 semantic_search(query="하려는 일 + 재료·대상", userContext="작업 맥락(비우지 않음)", limit=5, _source="skill-suggest")
규칙: 0.40 이상→get_plugin_content로 로드, 미만→report_search_skip으로 스킵 보고. 상세 절차는 skill-suggest SKILL.md 참조.</team-skills>
CONTEXT
    ;;
  *)
    cat <<'CONTEXT'
<team-skills>이전 대화의 직접적 후속(확인, 수정, "계속해줘" 등)이 아니면 반드시 검색하세요. 새 기술/도구 질문, 사용법, 구현 요청 모두 포함됩니다. 같은 프로젝트라도 새 결과물(화면, 글, 문서)을 만들라는 요청은 새 작업으로 보고 검색하세요. 사용자가 팀 스킬이나 aitk 스킬을 쓰라고 하면 검색하세요. 재료가 없어 되물어야 할 때도 묻기 전에 먼저 검색하세요. 맞는 스킬이 무엇을 물어야 할지 알려 줍니다.
검색: Bash("aitk search '하려는 일 + 재료·대상' --limit 5 --context '작업 맥락(비우지 않음)'")
규칙: 0.40 이상→Bash("aitk get '스킬ID'")로 로드, 미만→Bash("aitk report-skip --query '검색어' --reason '사유'")로 스킵 보고. 상세 절차는 skill-suggest SKILL.md 참조.</team-skills>
CONTEXT
    ;;
esac
