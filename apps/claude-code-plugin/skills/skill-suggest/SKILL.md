---
name: skill-suggest
description: "사용자가 팀 스킬이나 플러그인 검색을 요청했을 때 관련 스킬을 검색합니다."
---

# Skill Suggest (수동 검색)

사용자가 직접 스킬/플러그인 검색을 요청했을 때 적용합니다 ("스킬 검색해줘", "유튜브 관련 스킬 찾아줘" 등).

## 검색 방법 결정

`~/.config/aitk/config.json`의 `searchMethod` 설정을 확인하고 그에 맞는 경로로 검색합니다.
사용자가 고른 경로이므로 설정을 따릅니다 — `cli`이면 MCP 도구로 검색하지 않습니다.

| searchMethod | 검색 경로 | MCP 연결 실패 시 |
|---|---|---|
| `cli` (값이 없을 때 기본값) | `aitk` CLI | — |
| `mcp` | MCP 도구 | 검색을 건너뛰고 작업을 계속합니다 |
| `auto` | MCP 도구 먼저 | `aitk` CLI로 다시 검색합니다 |

설정을 바꾸려면 `aitk config set searchMethod <cli|mcp|auto>`를 씁니다.

MCP 도구는 `gpters-ai-toolkit` 서버의 도구이고, 아래에는 도구 이름만 적습니다. Claude Code에서
실제로 보이는 이름은 설치 방식에 따라 다릅니다 — 플러그인으로 설치했으면
`mcp__plugin_gpters-ai-toolkit_gpters-ai-toolkit__<도구>`, `claude mcp add`로 직접 연결했으면
`mcp__gpters-ai-toolkit__<도구>`입니다.

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

MCP 모드 (`mcp`, `auto`):
```
semantic_search(query="추출된 키워드", userContext="작업 맥락", limit=3, _source="skill-suggest")
```

CLI 모드 (`cli`, 또는 `auto`에서 MCP 연결 실패):
```
Bash("aitk search '추출된 키워드' --limit 3 --context '작업 맥락'")
```

`userContext`/`--context`는 맥락이 있을 때만 전달합니다.

### 3단계: 결과 판단 — 로드하거나 스킵을 보고한다

검색했으면 A나 B 중 하나로 끝냅니다. 결과가 하나도 없어도 B를 실행합니다 — 검색마다 로드나
스킵 보고가 남아야 추천 퍼널이 집계됩니다.

**A. `relevanceScore` 0.40 이상 스킬이 있으면 → 로드:**

MCP 모드:
```
get_plugin_content(pluginId="스킬ID")
```

CLI 모드:
```
Bash("aitk get '스킬ID'")
```

**B. 결과가 없거나, 전부 0.40 미만이거나, 관련 없으면 → 스킵 사유 보고:**

MCP 모드 (결과가 없으면 `resultIds=[]`):
```
report_search_skip(query="검색어", resultIds=["id1","id2"], reason="스킵 사유 한 줄")
```

CLI 모드 (결과가 없으면 `--result-ids` 생략):
```
Bash("aitk report-skip --query '검색어' --reason '스킵 사유 한 줄' --result-ids 'id1,id2'")
```

### 4단계: 실제 적용 시작 보고

스킬을 단순히 읽은 시점이 아니라, **현재 작업에 적용하기로 결정한 직후** 시작을 보고합니다.
검색만 했거나 관련성이 낮아 스킵한 스킬에는 실행 보고를 만들지 않습니다.

MCP 모드:
```
report_skill_execution_started(skillId="스킬ID", agent="claude-code")
```

CLI 모드:
```
Bash("aitk report-execution-start --skill-id '스킬ID' --agent claude-code")
```

응답의 `attemptId`를 기억합니다. 공유 머신의 봇을 구분해야 하면 시작·완료 모두에
`agentId="안정적인-봇-id"` 또는 `--agent-id '안정적인-봇-id'`를 추가합니다. 생략하면
`AITK_AGENT_ID`, 로컬 `agentId` 설정, 런타임 이름 순서로 결정됩니다. 단일 봇 머신은
`aitk config set agentId '안정적인-봇-id'`로 한 번 설정하고, 여러 봇이 같은 OS 계정을
공유하면 전역 설정 대신 봇 프로세스별 `AITK_AGENT_ID` 또는 명시 인자를 사용합니다.

### 5단계: 적용하고 검증

스킬 지침을 작업에 적용한 뒤 가능한 가장 강한 방법으로 결과를 검증합니다.

| validation.method | 사용 시점 |
|---|---|
| `test` | 자동화 테스트를 실행함 |
| `command` | 검사·빌드·조회 명령으로 확인함 |
| `artifact` | 생성된 문서·파일·화면을 확인함 |
| `user_confirmation` | 사용자가 결과를 확인함 |
| `none` | 객관적 검증을 하지 못함 |

### 6단계: 같은 시도의 완료 보고

4단계에서 받은 **같은 `attemptId`**로 완료를 보고합니다. `status`는
`success | partial | failed | abandoned` 중 하나입니다.

MCP 모드:
```
report_skill_execution(
  attemptId="시작 응답의 attemptId",
  skillId="스킬ID",
  agent="claude-code",
  status="success",
  validation={"method":"test","passed":true,"summary":"단위 테스트 통과"}
)
```

CLI 모드:
```
Bash("aitk report-execution --skill-id '스킬ID' --agent claude-code --attempt-id '시작 응답의 attemptId' --status success --validation-method test --validation-passed true --validation-summary '단위 테스트 통과'")
```

- 실패하면 `failureStage`(`load | instruction | dependency | execution | validation`)와 짧은
  `errorCode`를 함께 보냅니다.
- 요약에는 대화 원문, 파일 내용, 명령 출력 전문, 경로, ID, 인증정보를 넣지 않습니다.
- 보고 실패가 사용자 작업을 막아서는 안 됩니다. 실패 사실만 짧게 남기고 본 작업을 계속합니다.

## 주의사항

- 스킬 내용이 사용자 요청과 충돌하면 사용자 요청을 우선합니다
- 시작 보고 없이 완료 보고만 만들지 말고, 한 시도에는 시작·완료가 같은 `attemptId`로 연결되어야 합니다
