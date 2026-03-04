---
name: skill-suggest
description: "새 작업/주제 변경 시 팀 스킬을 자동 검색합니다."
---

# Skill Suggest (자동 트리거)

> **IMPORTANT**: 새 작업을 시작하거나 주제가 바뀔 때 아래 워크플로우를 수행하세요.

## 검색 여부 판단 (반드시 먼저 확인)

**검색하는 경우:**
- 새로운 작업/기능 구현을 시작할 때
- 대화 주제가 명확히 바뀔 때

**검색하지 않는 경우 (이 경우 즉시 무시):**
- 기존 대화의 후속 질문, 확인, 수정 요청
- "계속해줘", "푸시해줘", "커밋해줘", "다시 해봐" 같은 지시형 메시지
- 이전 응답에 대한 피드백이나 추가 설명 요청
- 이미 이번 세션에서 같은 주제로 검색한 적이 있는 경우

## 워크플로우

### 1단계: 핵심 키워드 + 작업 맥락 추출

사용자 프롬프트에서 두 가지를 추출합니다:

1. **핵심 키워드 (2~4단어)**: 작업 의도를 나타내는 핵심 키워드
2. **작업 맥락 (선택)**: 현재 대화에서 파악된 기술 스택, 진행 상황 등 배경 정보

예시:
- "React로 대시보드 만들어줘" → 키워드: `"React 대시보드"`, 맥락: 없음
- "코드 리뷰 해줘" → 키워드: `"코드 리뷰"`, 맥락: 없음
- "슬랙 봇에서 멘션 수집하는 기능 추가해줘" (airtable 연동 진행 중) → 키워드: `"슬랙 봇 멘션 수집"`, 맥락: `"airtable 연동, 슬랙 API"`

### 2단계: 스킬 검색

검색 모드(`~/.config/aitk/config.json`의 `searchMethod`)에 따라 다르게 검색합니다:

**MCP 모드 (`mcp` 또는 `auto`):**
```
mcp_gpters-ai-toolkit_semantic_search(query="추출된 키워드", userContext="작업 맥락", limit=3, _source="skill-suggest")
```

**CLI 모드 (`cli`):**
```
Bash("aitk search '추출된 키워드' --limit 3 --context '작업 맥락'")
```

> `auto` 모드에서 MCP 연결 불가 시 CLI로 fallback합니다.
> `userContext`/`--context`는 맥락이 있을 때만 전달합니다.

### 3단계: 결과 판단 + 로드

검색 결과의 `relevanceScore`를 확인합니다:

**A. 0.40 이상 스킬이 있으면 → 로드:**

MCP 모드:
```
mcp_gpters-ai-toolkit_get_plugin_content(pluginId="스킬ID")
```

CLI 모드:
```
Bash("aitk get '스킬ID'")
```

**B. 전부 0.40 미만이거나 관련 없으면 → 스킵 사유 보고:**

MCP 모드:
```
mcp_gpters-ai-toolkit_report_search_skip(query="검색어", resultIds=["id1","id2"], reason="스킵 사유 한 줄")
```

CLI 모드:
```
Bash("aitk report-skip --query '검색어' --reason '스킵 사유 한 줄' --result-ids 'id1,id2'")
```

> 검색 후 아무 행동 없이 넘어가지 마세요. A 또는 B 중 하나는 반드시 실행합니다.

### 4단계: 적용 결과 보고

스킬을 로드해서 작업에 적용한 후, 결과를 보고합니다:

MCP 모드:
```
mcp_gpters-ai-toolkit_report_skill_outcome(skillId="스킬ID", applied=true/false, summary="결과 한 줄")
```

CLI 모드:
```
Bash("aitk report-outcome --skill-id '스킬ID' --applied true --summary '결과 한 줄'")
```

## 검색 모드 설정

`~/.config/aitk/config.json`의 `searchMethod` 필드로 검색 방법을 설정할 수 있습니다:

```json
{
  "searchMethod": "auto"
}
```

| 값 | 동작 |
|----|------|
| `auto` | MCP 우선, 연결 불가 시 aitk CLI fallback (기본값) |
| `mcp` | MCP만 사용. 연결 불가 시 검색 스킵 |
| `cli` | aitk CLI만 사용 |

설정 변경:
```bash
# CLI로 설정
aitk config set searchMethod cli

# 또는 직접 편집
vi ~/.config/aitk/config.json
```

## 주의사항

- 스킬 내용이 사용자 요청과 충돌하면 사용자 요청을 우선합니다
- MCP 서버 연결 실패 시 스킬 검색을 건너뛰고 작업을 진행합니다
- 결과가 없으면 검색 없이 바로 진행합니다
