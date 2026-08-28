# OpenClaw 공식 OpenTelemetry 수집 프로토콜 전환안

상태: 후속 개발 제안 · 현재 운영 경로 아님 · [Linear DEV-4256](https://linear.app/geniefy/issue/DEV-4256)
작성일: 2026-08-28

## 배경

현재 AITK 수집기는 OpenClaw의 저장 형식 전환을 안전하게 따라가기 위해 한 소스에서 두
형식을 지원한다.

- legacy/archive: `<stateDir>/agents/<agentId>/sessions/**/*.jsonl`
- current: `<stateDir>/agents/<agentId>/agent/openclaw-agent.sqlite`

SQLite가 있으면 JSONL과 합치지 않고 SQLite만 읽는다. `schema_meta.agent_id`와 선택한 내부
agent ID를 비교하고, 체크포인트에는 그 ID의 SHA-256만 저장한다. 이는 기존 설치를 중단하지
않기 위한 로컬 호환 계층이지 장기적인 공식 전송 프로토콜은 아니다.

OpenClaw는 한 Gateway 안에 여러 격리 agent를 둘 수 있으며 각 agent가 별도 SQLite 세션
저장소를 가진다. OpenClaw 공식 문서는 `diagnostics-otel` 플러그인과 OTLP 전송도 제공한다.
따라서 실시간 신규 이벤트는 공식 OpenTelemetry 신호로 받고, 로컬 수집기는 과거 backfill과
전환기 대조에 한정하는 것이 장기 목표다.

## 공식 근거

- [Multi-agent routing](https://github.com/openclaw/openclaw/blob/main/docs/concepts/multi-agent.md)
  - Gateway 내부 agent마다 workspace, 인증, session store가 분리된다.
  - 현재 session store는 agent별 `openclaw-agent.sqlite`, JSONL은 legacy/archive다.
- [Database schemas](https://github.com/openclaw/openclaw/blob/main/docs/reference/database-schemas.md)
  - `schema_meta`에 `role`, `agent_id`, `schema_version`, `app_version`이 기록된다.
  - live WAL DB는 main 파일만 복사하면 안 되며 WAL-aware snapshot이 필요하다.
- [Doctor migration](https://github.com/openclaw/openclaw/blob/main/docs/cli/doctor.md)
  - Gateway startup과 `doctor --fix`가 legacy session/transcript를 agent별 SQLite로 가져온다.
- [OpenTelemetry](https://github.com/openclaw/openclaw/blob/main/docs/gateway/opentelemetry.md)
  - token, model usage, skill usage, tool execution, run duration, exporter health 등을 OTLP로
    내보내며 metrics/traces/logs를 독립적으로 설정할 수 있다.

## 목표 구조

```text
OpenClaw diagnostics-otel
  -> TLS + collector credential
  -> GPTERS OTLP receiver 또는 관리형 OTel Collector bridge
  -> 기존 AgentTelemetryBatch 정규화 계층
  -> AX telemetry tables / dashboard
```

배치 귀속 단위는 기존 계약과 동일하게 `(dashboardAgentId, source, collectorInstanceId)`로
유지한다. OpenClaw의 내부 `agent_id`는 서버 등록 시 명시적으로 하나의 dashboard agent에
매핑하고, 자동 추정하거나 payload 라벨을 그대로 신뢰하지 않는다.

## 신호 매핑 초안

| OpenClaw 공식 신호 | AX 의미 | 주의점 |
|---|---|---|
| token/model usage metrics·spans | usage 5종, model mix, turns | thinking 포함 관계와 agent 귀속 검증 필요 |
| skill usage metrics·spans | skillLoads | load·실패·중단 의미를 현재 계약과 맞춰야 함 |
| tool execution metrics·spans | tools calls/failures | trace context에서 agent 경계를 증명해야 함 |
| run/message/session signals | sessions, turns, freshness | 재시작·누적 counter reset 처리 필요 |
| exporter health | collection health | 전송 지연과 실제 수집 공백을 구분해야 함 |

공식 metric 이름은 OpenClaw 버전에 따라 확장될 수 있으므로 이름만 하드코딩하지 않는다.
지원 버전별 capability probe와 allowlist 기반 정규화가 필요하다.

## 개인정보·보안 원칙

- `diagnostics.otel.captureContent`는 반드시 `false`로 고정하고 시작 시 검증한다.
- prompts, responses, tool arguments/results, commands, cwd, session key, raw message/session ID는
  수집·로그·dead-letter payload에 저장하지 않는다.
- logs signal은 기본 비활성화한다. 필요성이 입증되기 전에는 metrics와 제한된 traces만 받는다.
- OTLP endpoint는 TLS와 collector 전용 credential을 사용하며 credential은 agent/source 범위에
  묶고 회전·폐기 가능해야 한다.
- server-side attribute allowlist와 크기 제한, rate limit, retention을 적용한다.
- 인증되지 않은 `agent.id` attribute만으로 소유권을 결정하지 않는다.

## 중복 방지와 전환

같은 OpenClaw 활동에 로컬 JSONL/SQLite 수집과 OTLP 수집을 동시에 합산하면 안 된다.

1. hybrid local collector를 기준선으로 유지한다.
2. 동일 agent를 OTLP shadow mode로 연결하되 서버 집계에는 반영하지 않는다.
3. 7일 이상 token/model/tool/skill/turn 값을 시간 구간별로 비교한다.
4. 누락·counter reset·재전송 idempotency를 해결한다.
5. agent 단위 cutover 시점을 기록하고, 그 시점 이후에는 OTLP만 집계한다.
6. 로컬 수집기는 과거 backfill·장애 복구용으로 남기되 자동 스케줄을 해제한다.

OpenClaw 아래에서 Claude Code나 Codex harness를 함께 수집하는 경우에도 같은 활동을 두 source로
합치지 않는다. source coverage 화면에서 중첩 가능성을 명시하고 설치 단계에서 사용자가 하나의
권위 소스를 선택하도록 한다.

## 해결해야 할 설계 질문

- token metrics/spans가 모든 경우에 내부 OpenClaw agent를 안정적으로 식별하는가?
- thinking/reasoning token과 output token의 포함 관계를 어떤 attribute로 증명할 수 있는가?
- OpenTelemetry cumulative counter가 Gateway 재시작 또는 exporter 재설정 때 초기화될 경우
  delta와 idempotency를 어떻게 계산할 것인가?
- tool/skill 실패·중단 의미가 기존 AX 계약과 정확히 일치하는가?
- offline laptop의 backlog, retry, out-of-order delivery를 어떤 window/batch ID로 정규화할 것인가?
- 지원하는 OpenClaw 최소 버전과 capability negotiation 방식은 무엇인가?

## 구현 범위

1. GPTERS OTLP 수신 endpoint 또는 OTel Collector bridge를 선택한다.
2. collector 등록 API에 OpenClaw 내부 agent 매핑과 OTLP credential 발급을 추가한다.
3. attribute allowlist, payload size/rate limit, content 차단 검사를 구현한다.
4. 공식 OpenClaw 신호를 기존 `AgentTelemetryBatch`/DB 스키마로 정규화한다.
5. counter reset, retry, out-of-order, duplicate 전송 테스트를 추가한다.
6. 로컬 hybrid collector와 shadow 비교 리포트를 만든다.
7. agent별 cutover/runbook/rollback을 문서화한다.

## 완료 조건

- `captureContent:false`가 자동 검증되며 민감 본문이 수신·로그·DB 어디에도 없다.
- 하나의 OTLP credential이 하나의 승인된 `(dashboardAgentId, openclawAgentId, source)`에만
  기록할 수 있다.
- token/model/tool/skill/turn/freshness가 7일 shadow 비교에서 합의한 오차 범위 안에 든다.
- Gateway/exporter 재시작, 중복·지연·역순 전송에서도 이중 집계되지 않는다.
- 같은 활동의 local collector와 OTLP가 동시에 운영 집계에 포함되지 않는다.
- health 화면에서 exporter 장애, 수집 공백, 정상 무활동을 구분할 수 있다.
- rollout과 rollback이 agent 단위로 가능하고 기존 AITK/MCP 동작을 중단하지 않는다.

## 범위 밖

- 과거 데이터 전체를 OTLP로 재생하는 기능
- transcript 본문 검색·보관
- OpenClaw가 아닌 Claude Code, Codex, Hermes의 공식 프로토콜 통합
- 현재 hybrid collector 제거
