# 스킬 실행 결과 이벤트 계약 — 로컬 구현본

> 2026-08-26: 0029에서 안정적인 `agentId`와 시작/완료 이벤트를 추가하고,
> MCP·CLI·에이전트별 계측 건강도 화면을 로컬에 구현했다. 운영 DB·CLI·웹에는 반영하지 않았다.

현재의 `report_skill_outcome(applied=true)`는 “에이전트가 로드한 스킬을 작업에 적용했다고 보고함”만
뜻한다. 사용자의 목표를 달성했는지, 스킬이 약속한 검증을 통과했는지까지 증명하지 않는다.
따라서 대시보드는 이를 실행 성공률로 부르지 않고, 아래 계약이 수집된 뒤 성공 지표를 추가한다.

## 측정 단위

한 번의 실제 적용 시도를 `attemptId`로 식별한다. 실제 적용을 결정한 직후 시작 이벤트를 보내고,
작업·검증이 끝나면 같은 `attemptId`로 완료 이벤트를 보낸다. 각 이벤트 재전송은 해당 `eventId`로
멱등 처리한다.

```jsonc
// report_skill_execution_started
{
  "eventId": "uuid",
  "attemptId": "uuid",
  "journeyId": "uuid" | null,
  "source": "aitk" | "bbopters-shared",
  "skillId": "review-helper",
  "skillVersion": "1.2.0" | null,
  "agent": "claude-code" | "codex" | "openclaw" | "hermes" | "test-agent",
  "agentId": "claude-reviewer",
  "occurredAt": "2026-08-26T00:00:00Z"
}
```

```jsonc
// report_skill_execution (완료)
{
  "eventId": "uuid",
  "attemptId": "uuid",
  "journeyId": "uuid" | null,
  "source": "aitk" | "bbopters-shared",
  "skillId": "review-helper",
  "skillVersion": "1.2.0" | null,
  "agent": "claude-code" | "codex" | "openclaw" | "hermes" | "test-agent",
  "agentId": "claude-reviewer",
  "status": "success" | "partial" | "failed" | "abandoned",
  "failureStage": "load" | "instruction" | "dependency" | "execution" | "validation" | null,
  "errorCode": "DEPENDENCY_MISSING" | null,
  "validation": {
    "method": "test" | "command" | "artifact" | "user_confirmation" | "none",
    "passed": true | false | null,
    "summary": "민감정보를 제외한 짧은 검증 요약"
  },
  "userAccepted": true | false | null,
  "occurredAt": "2026-08-25T00:00:00Z"
}
```

`agent`는 실행 환경 종류이고 `agentId`는 실제 봇의 안정적인 소문자 slug다. 사람의 주간 활성이나
토큰 지표에는 합치지 않으며, 에이전트별 실행 현황에서만 사용한다.

`journeyId`는 검색→로드→실행을 잇는 선택 UUID다. MCP transport `sessionId`와 역할이 다르며,
단발 CLI 실행은 session 없이도 정식 실행 시도로 저장한다. 기존 클라이언트가 journeyId를 보내지
않아도 보고는 거부하지 않는다.

대화 원문, 파일 내용, 명령 출력 전문, 인증 정보는 보내지 않는다. `summary`는 길이를 제한하고
민감정보를 제거한 분류·요약만 허용한다.

## 판정 규칙

| 상태 | 의미 |
| --- | --- |
| `success` | 스킬이 요구한 핵심 작업을 수행했고, 가능한 검증이 통과함 |
| `partial` | 일부 산출물은 만들었지만 요구사항 일부가 남았거나 검증 일부가 실패함 |
| `failed` | 시도했지만 작업 또는 필수 검증을 완료하지 못함 |
| `abandoned` | 로드 후 시도를 시작하지 않았거나 다른 접근으로 전환함 |

`validation.method=none`인 자기보고 성공과 테스트·산출물 검증이 있는 성공은 대시보드에서 분리한다.
사용자 수락은 환경상 관측 가능한 경우에만 기록하며, 없다고 실패로 간주하지 않는다.

## 대시보드 지표

- **검증 성공률** = `status=success`이면서 `validation.passed=true`인 시도 / 검증 결과가 있는 완료 시도
- **자기보고 성공률** = `status=success`인 시도 / `success|partial|failed` 시도
- **완료 보고 지연** = 시작 후 30분 안에 완료 이벤트가 없는 `attemptId`
- **재실행률** = 같은 주체가 같은 스킬을 다른 세션에서 다시 실행한 비율
- **실패 단계 분포** = `failureStage`별 실패·부분 성공 시도 수

`abandoned`와 무응답은 실패율 분모에 조용히 섞지 않고 별도 표시한다. 그래야 에이전트가 결과 보고를
누락해 성공률이 실제보다 좋아지는 문제를 볼 수 있다.

## 기존 이벤트와의 관계

- `search`와 `load`는 탐색 퍼널 이벤트로 유지한다.
- 기존 `apply/skip`은 적용 여부의 과거 지표로 보존한다.
- 시작·완료 이벤트는 `ax_skill_execution_events`에 따로 적재하고, 현재 상태는
  `ax_skill_execution_attempts`에 투영한다.
- `bbopters-shared`와 aitk 이벤트는 `source`로 구분하며 자동 합치지 않는다.

## 운영 연결 전 남은 게이트

1. 스킬 버전 정본: `SKILL.md` frontmatter, 없으면 commit SHA 대체 표기
2. 서비스 인증: 사람 OAuth와 무인 에이전트별 토큰 분리
3. 보존 기간과 민감정보 필터 확정
4. 30분 완료 지연 기준이 장시간 스킬에도 적절한지 실제 분포로 재평가
5. 첫 사내 에이전트에서 shadow mode로 성공·실패·무응답 판정 일관성 검증

로컬 구현은 다음 기본값으로 검증했다: 버전은 선택 입력, 시도 시작은 에이전트의 명시 보고,
인증은 기존 MCP 사용자 인증, 요약은 240자 제한과 비밀 패턴 거부, 합성 fixture는 성공·부분 성공·실패·중단
및 진행 중·완료 보고 지연 각 1건이다. 운영 연결 전에는 위 항목의 조직 정책을 확정해야 하며, 특히 무인 에이전트 인증과
보존 기간을 로컬 기본값 그대로 가정하지 않는다.

## 로컬 구현 위치와 검증

- DB: `packages/db/drizzle/0029_ax_skill_execution_attempts.sql`, `0030_ax_execution_lifecycle.sql`,
  `0033_ax_skill_journeys.sql`
- 검증 계약: `packages/lib/src/features/ax/execution-report.ts`
- 멱등 저장: `event_id` unique + conflict 무시
- MCP/CLI: `report_skill_execution_started` + `report_skill_execution`,
  `aitk report-execution-start` + `aitk report-execution`
- 합성 데이터: `infra/ax-local/refresh-execution-demo.sql`
- 격리 실호출: `pnpm ax:local:test-agent` (`infra/ax-local/test-agent.mjs`)
- 빈 DB 검증: `pnpm ax:local:verify-rebuild`
