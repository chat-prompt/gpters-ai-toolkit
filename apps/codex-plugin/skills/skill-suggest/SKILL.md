---
name: skill-suggest
description: "새 작업/주제 변경 시 팀 스킬을 자동 검색합니다."
---

# Skill Suggest (자동 트리거 + 수동 검색)

> **IMPORTANT**: 이 스킬은 두 가지 경우에 적용됩니다:
> 1. 새 작업을 시작하거나 주제가 바뀔 때 (자동 트리거)
> 2. 사용자가 직접 스킬/플러그인 검색을 요청했을 때 ("스킬 검색해줘", "유튜브 관련 스킬 찾아줘" 등)

## 검색 방법 결정 (모든 검색에 필수)

스킬 검색 시 **반드시** `~/.config/aitk/config.json`의 `searchMethod` 설정을 확인하고, 설정에 맞는 방법으로 검색합니다:

| searchMethod | 검색 방법 |
|---|---|
| `cli` | `Bash("aitk search '키워드'")` — **MCP 도구 사용 금지** (기본값) |
| `mcp` | `mcp_gpters-ai-toolkit_semantic_search(...)` |
| `auto` | MCP 우선, 연결 불가 시 aitk CLI fallback |

> **주의**: `searchMethod`가 `cli`인데 MCP 도구(`semantic_search`)로 검색하면 안 됩니다. 사용자가 의도적으로 CLI 모드를 선택한 것이므로 반드시 `aitk` CLI를 사용하세요.

## 검색 여부 판단 (자동 트리거 시에만 확인)

사용자가 직접 검색을 요청한 경우에는 이 판단을 건너뛰고 바로 검색합니다.
자동 트리거 시에만 아래 기준으로 판단합니다:

**기본 원칙: 새 주제면 무조건 검색합니다.** 아래 "검색하지 않는 경우"에 해당하지 않으면 전부 검색 대상입니다.

**검색하는 경우 (예시):**
- 새로운 작업/기능 구현을 시작할 때
- 대화 주제가 명확히 바뀔 때
- 새로운 기술/프레임워크/도구에 대한 질문 (예: "remotion 어떻게 써", "Redis 설정 방법")
- 사용법, 가이드, 튜토리얼 요청
- 일반 프로그래밍 질문이라도 팀에 관련 스킬이 있을 수 있으므로 검색

**검색하지 않는 경우 (이 경우에만 스킵):**
- 바로 직전 응답에 대한 후속 질문, 확인, 수정 요청
- "계속해줘", "푸시해줘", "커밋해줘", "다시 해봐" 같은 지시형 메시지
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

### 4단계: 실제 적용 시작 보고

스킬을 단순히 읽은 시점이 아니라, **현재 작업에 적용하기로 결정한 직후** 시작을 보고합니다.
검색만 했거나 관련성이 낮아 스킵한 스킬에는 실행 보고를 만들지 않습니다.

MCP 모드:
```
mcp_gpters-ai-toolkit_report_skill_execution_started(skillId="스킬ID", agent="codex")
```

CLI 모드:
```
Bash("aitk report-execution-start --skill-id '스킬ID' --agent codex")
```

응답의 `attemptId`를 기억합니다. 뽀둥이처럼 공유 머신의 봇을 구분해야 하면 시작·완료 모두에
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
mcp_gpters-ai-toolkit_report_skill_execution(
  attemptId="시작 응답의 attemptId",
  skillId="스킬ID",
  agent="codex",
  status="success",
  validation={"method":"test","passed":true,"summary":"단위 테스트 통과"}
)
```

CLI 모드:
```
Bash("aitk report-execution --skill-id '스킬ID' --agent codex --attempt-id '시작 응답의 attemptId' --status success --validation-method test --validation-passed true --validation-summary '단위 테스트 통과'")
```

- 실패하면 `failureStage`(`load | instruction | dependency | execution | validation`)와 짧은
  `errorCode`를 함께 보냅니다.
- 요약에는 대화 원문, 파일 내용, 명령 출력 전문, 경로, ID, 인증정보를 넣지 않습니다.
- 보고 실패가 사용자 작업을 막아서는 안 됩니다. 실패 사실만 짧게 남기고 본 작업을 계속합니다.

## 검색 모드 설정

`~/.config/aitk/config.json`의 `searchMethod` 필드로 검색 방법을 설정할 수 있습니다:

```json
{
  "searchMethod": "auto"
}
```

| 값 | 동작 |
|----|------|
| `cli` | aitk CLI만 사용 (기본값) |
| `mcp` | MCP만 사용. 연결 불가 시 검색 스킵 |
| `auto` | MCP 우선, 연결 불가 시 aitk CLI fallback |

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
- 시작 보고 없이 완료 보고만 만들지 말고, 한 시도에는 시작·완료가 같은 `attemptId`로 연결되어야 합니다
