# 공유 스킬(bbopters-shared) — AX 대시보드 연결 계약

`bbopters-shared`는 OpenClaw 등 사내 에이전트가 공용으로 불러 쓰는 별도 스킬 저장소다.
AI Toolkit 카탈로그에 없다는 이유로 사내 스킬 집계에서 빠지면 안 된다 (DEV-4140).
이 문서는 그 저장소를 대시보드에 붙이기 위한 데이터 계약을 정의한다.

## 단계

| 단계 | 내용 | 상태 |
| -- | -- | -- |
| 1. 인벤토리 | 저장소의 스킬 목록을 대시보드에 표시 | **구현됨** — `shared-skills` 패널 |
| 2. 버전 식별 | 스킬별 버전을 인벤토리에 표시 | 계약만 정의 |
| 3. 실행 이벤트 | 에이전트별 스킬 사용량 집계 | 계약만 정의 |

## 1. 인벤토리 (구현됨)

- 소스: GitHub git trees API 한 번 (`GET /repos/{repo}/git/trees/HEAD?recursive=1`)
- 규칙: `{BBOPTERS_SHARED_SKILLS_PATH}/{id}` 디렉터리 하나 = 스킬 하나. 디렉터리 이름이 스킬 id다.
- `SKILL.md`가 없는 디렉터리도 목록에는 넣되 규격 미준수 후보로 표시한다 — 숨기면 "저장소에 없는 스킬"로 오독된다.
- 환경변수: `BBOPTERS_SHARED_REPO`(owner/repo), `GH_TOKEN`, 선택 `BBOPTERS_SHARED_SKILLS_PATH`(기본 `skills`)
- 캐시 5분. tree 응답이 `truncated`면 그 사실을 화면까지 전달한다.

## 2. 버전 식별 (계약)

정본은 각 스킬의 `SKILL.md` frontmatter `version` 필드로 한다.

- 이유: aitk 카탈로그도 스킬 버전을 문서 메타데이터로 관리한다. 별도 매니페스트 파일을 만들면 정본이 둘이 된다.
- frontmatter에 `version`이 없으면 대시보드는 커밋 SHA 앞 7자리를 대체 표기로 쓴다. 버전을 지어내지 않는다.
- 구현 시 주의: 스킬마다 `SKILL.md`를 읽으면 스킬 수만큼 API 요청이 나간다. 저장소 쪽에 CI로 `skills-manifest.json`(id → version)을 생성해 두고 대시보드는 그 파일 하나만 읽는 방식을 권장한다. 매니페스트는 CI 산출물이므로 정본 지위를 갖지 않는다.

## 3. 실행 이벤트 (계약)

### 이벤트 스키마

사내 에이전트(OpenClaw 등)가 스킬을 실행할 때 아래 규격으로 보고한다.

```jsonc
{
  "source": "bbopters-shared",   // 스킬 출처 저장소. aitk 카탈로그 이벤트와 구분하는 키
  "skillId": "review-helper",    // 디렉터리 이름 (인벤토리의 id와 동일)
  "version": "1.2.0",            // 실행 시점에 로드한 버전. 모르면 null — 지어내지 않는다
  "agent": "openclaw",           // 실행 주체 에이전트 식별자
  "action": "load" | "apply",    // aitk skill_events의 action 어휘를 재사용한다
  "occurredAt": "2026-08-19T02:00:00Z"
}
```

포함하지 않는 것: 대화 원문, 파일 경로, 인증 정보, 개인 식별자. 공유 계정 에이전트는
사용자 귀속이 안 되므로 **사람이 아니라 에이전트 단위로만** 집계한다.

### 수집 경로

클라이언트 사용량과 같은 패턴을 재사용한다: 에이전트가 MCP 도구(`report_usage`의
자매 도구 `report_agent_skill_event`)로 보고 → `ax_agent_skill_events` 테이블 적재.

- 인증: 에이전트별 서비스 토큰. 사람 세션을 요구하면 무인 에이전트가 보고할 수 없다.
- 중복 방지: `(agent, skillId, occurredAt)` 유니크. 재전송이 이중 계상으로 이어지면 안 된다.
- 테이블·MCP 도구는 첫 에이전트 구현이 붙는 시점에 마이그레이션과 함께 만든다.
  빈 테이블을 미리 만들면 "수집 중인데 0건"과 "미연결"이 화면에서 구분되지 않는다.

### aitk 스킬과의 매핑 규칙

같은 스킬이 aitk 카탈로그와 bbopters-shared 양쪽에 있을 수 있다.

1. 두 소스의 이벤트는 **합산하지 않는다.** `source`로 항상 구분해 표시한다 (완료 기준: "출처를 구분할 수 있다").
2. id가 같아도 같은 스킬이라고 단정하지 않는다 — 동일성 판단이 필요해지면 명시적 매핑 테이블(`skill_id_map`)로 관리하고, 자동 추론은 하지 않는다.
3. "사내 스킬 현황" 합계를 낼 때는 소스별 소계를 먼저 보여주고 합계는 그 다음이다.

## 소유권

- 저장소·스킬 내용의 정본은 `bbopters-shared` 원본 저장소가 갖는다. 대시보드는 읽기만 한다.
- 실행 이벤트의 정본은 aitk DB(`ax_agent_skill_events`)가 갖는다. 에이전트 쪽에는 보고 큐 이상의 상태를 두지 않는다.
