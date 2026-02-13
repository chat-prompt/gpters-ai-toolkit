#!/bin/bash
# UserPromptSubmit hook: 매 프롬프트마다 경량 힌트를 주입합니다.
# 실제 검색 여부는 Claude가 대화 맥락을 보고 판단합니다.

cat <<'CONTEXT'
<team-skills>새 작업/주제 변경 시 mcp__gpters-ai-toolkit__semantic_search로 관련 팀 스킬을 확인하세요. 기존 대화의 후속이면 무시하세요.</team-skills>
CONTEXT
