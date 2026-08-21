# 사내 AX 대시보드

사내에서 AI를 실제로 얼마나·어떻게 쓰고 있는지 한 화면에서 보는 곳. 여기서 시작해 회사 전체 지표(B2B·B2C·Rona 성과)를 얹을 수 있는 형태로 만들었다.

- 화면: `/{locale}/ax`
- 데이터 계층: `packages/lib/src/features/ax/`
- 화면 컴포넌트: `apps/web/components/ax/`

## 왜 aitk 안에 만들었나

세 가지가 이미 여기 있기 때문이다.

1. **인증·조직** — Google 로그인, 조직 멤버십, 역할이 이미 돌아간다. 대시보드용 인증을 새로 만들 이유가 없다.
2. **데이터** — 스킬 사용량(`skill_events`, `mcp_sessions`)이 이 DB에 쌓이고 있다. 밖에서 만들면 이 DB를 원격으로 붙어야 한다.
3. **접근 경로** — 팀원이 이미 매일 여는 화면이다. 별도 사이트는 안 보게 된다.

독립 앱으로 빼는 선택지도 있었지만, 위 셋을 처음부터 다시 붙이는 비용이 "결합도를 낮춘다"는 이득보다 컸다.

## 구조 — 패널

대시보드는 **패널** 단위로 구성된다. 패널 하나 = 데이터 소스 하나.

```
packages/lib/src/features/ax/
  types.ts          공용 타입 (AxPanel, AxPanelResult, 패널별 데이터 타입)
  panel.ts          결과 헬퍼 (panelOk / panelNotConfigured / panelError)
  access.ts         접근 판정 (resolveAxViewer / canViewPanel)
  registry.ts       패널 등록부  ← 여기에 한 줄 추가하면 화면에 뜬다
  overview.ts       성과 요약 (실측 지표 + 미계측 지표 명시)
  skills.ts         스킬 사용량
  shared-skills.ts  공유 스킬(bbopters-shared) 인벤토리
  usage.ts          클라이언트 사용량 (Claude Code · Codex)
  usage-report.ts   수집기 ↔ 서버 보고 계약 (aitk usage report → MCP report_usage)
  vercel.ts         배포 사이트
  subscriptions.ts  구독 현황
```

API는 라우트 하나가 레지스트리를 타고 처리한다.

- `GET /api/ax` — 요청자가 볼 수 있는 패널 메타 목록
- `GET /api/ax/{panelId}?days=7|30|90` — 패널 데이터

### 지표를 추가하려면

1. `packages/lib/src/features/ax/` 에 모듈을 만들고 `AxPanel`을 export
2. `registry.ts`의 `AX_PANELS` 배열에 추가
3. (선택) `apps/web/components/ax/panels/index.ts` 에 전용 컴포넌트 등록

3번을 건너뛰어도 화면에 뜬다 — 등록되지 않은 패널은 기본 렌더러가 표로 보여준다. B2B·B2C·Rona 성과를 붙일 때도 같은 절차다.

## 접근 권한

두 단계뿐이다.

| 대상 | 조건 |
| -- | -- |
| 대시보드 열람 | 로그인 + 내부 조직 도메인 이메일 (`INTERNAL_ORGANIZATION_DOMAIN`) |
| 개인 식별 데이터 | 위 조건 + 관리자(admin 이상) |

`INTERNAL_ORGANIZATION_DOMAIN`이 비어 있으면 **아무도 들어오지 못한다.** 사내 비용·배포 현황을 담는 화면이라, 환경변수 누락이 조용한 전체 공개로 이어지지 않게 막았다.

`users.role`은 조직과 무관한 전역 값이다. 그래서 관리자 역할만으로 도메인 검사를 건너뛰지 않는다 — 다른 조직 운영자에게 사내 데이터가 열리는 경로가 된다.

스킬 집계는 단일 GPTers 카탈로그 전체를 모집단으로 쓴다. 조직별 격리는 카탈로그 통합(2026-08)과 함께 제거됐고, 패널 컨텍스트에서도 orgId를 걷어냈다.

패널마다 `visibility: 'org' | 'admin'` 을 갖는다. 구독 패널은 `org`이지만 **팀원별 상세 행은 관리자에게만** 내려간다 — 일반 구성원에게는 벤더별 집계와 총액만 간다. 이름·이메일이 응답에 실리지 않는지는 테스트로 막아 두었다.

## 패널별 데이터 출처

| 패널 | 출처 | 상태 |
| -- | -- | -- |
| 성과 요약 | aitk DB (`skill_events` · `catalog_items`) — 스킬 사용량과 동일 모집단 | 자동 수집 |
| 스킬 사용량 | aitk DB (`skill_events` · `mcp_sessions` · `catalog_items`) | 자동 수집 |
| 공유 스킬 | GitHub git trees API (`BBOPTERS_SHARED_REPO` + `GH_TOKEN`) | 인벤토리만 · 5분 캐시. 실행 이벤트는 미연결 ([계약 설계](./ax-shared-skills.md)) |
| 클라이언트 사용량 | `ax_client_usage` 테이블 ← `aitk usage report` CLI → MCP `report_usage` | 팀원 머신에서 하루 1회 자동 보고 |
| 배포 사이트 | Vercel REST API (`VERCEL_API_TOKEN`, 선택 `VERCEL_TEAM_ID`) | 자동 조회 + 5분 캐시 |
| 구독 현황 | `ax_subscriptions` 테이블 ← 결제내역 트래커 시트에서 CSV import | 수동 갱신 |

성과 요약 패널은 목업의 지표 중 **실측 가능한 것만** 계산한다(주간 활성·누적 참여·일별 추이·활용 유형 분포·KST 시간대 밀도). 완료 세션·완주율·절감 시간·부서별 참여는 계측 근거가 없어 값 대신 "미계측 + 사유"로 내려간다 — 0이나 추정값으로 꾸미지 않는다는 완료 기준을 그대로 따른 것이다.

클라이언트 사용량 패널은 사람·클라이언트별 **최신 보고 한 건씩**을 집계한다(수집기 구간이 실행일 기준 롤링 윈도우라 전역 최신 구간으로 자르면 어제 보고한 사람이 사라진다). 마지막 보고가 14일을 넘긴 사람은 "현재 사용량"에서 뺀다. 참여율(보고 인원 / 내부 도메인 계정 수)도 함께 표시하는데, 분자는 수집기 표시명, 분모는 계정 수라 **근사치**다. `INTERNAL_ORGANIZATION_DOMAIN`이 없으면 분모를 추정하지 않고 보고 인원만 보여준다.

### 구독 테이블 생성

`packages/db/drizzle/0022_ax_subscriptions.sql` 을 적용하거나 `pnpm db:push` 로 스키마를 반영한다. SQL은 재실행해도 안전하게(`IF NOT EXISTS`) 작성돼 있다.

### 구독 데이터 갱신

시트가 정본이고 이 테이블은 대시보드용 사본이다.

```bash
pnpm --filter @gpters/db exec tsx scripts/import-ax-subscriptions.ts subscriptions.csv --dry-run
pnpm --filter @gpters/db exec tsx scripts/import-ax-subscriptions.ts subscriptions.csv
```

CSV 헤더: `vendor,plan,owner_name,renewal_day,payer,amount,currency,billing_cycle,status,note`

`(vendor, plan, owner_name, renewal_day)` 조합으로 upsert 한다. 결제일까지 키에 넣는 이유는 같은 사람이 같은 플랜을 둘 이상 쓰는 경우가 실제로 있어서다. CSV에 없는 기존 행은 지우지 않는다.

이메일은 담지 않는다. 이 화면에 필요한 건 "누구의 구독인가"이지 연락처가 아니다.

**환율 환산은 하지 않는다.** 통화별로 따로 합산해 보여준다 — 임의 환율로 만든 합계는 숫자만 그럴듯하고 검증이 안 된다.

## 환경변수

| 변수 | 필수 | 용도 |
| -- | -- | -- |
| `INTERNAL_ORGANIZATION_DOMAIN` | 권장 | 내부 구성원 판정 + 사용량 참여율의 분모. 비어 있으면 대시보드 접근이 전면 차단된다 |
| `VERCEL_API_TOKEN` | 배포 사이트 패널에 필요 | Vercel REST API 토큰. 없으면 해당 패널만 "미설정" 안내 |
| `VERCEL_TEAM_ID` | 선택 | 팀 계정 조회 시 |
| `BBOPTERS_SHARED_REPO` | 공유 스킬 패널에 필요 | 공유 스킬 저장소 (`owner/repo`). 없으면 해당 패널만 "미설정" 안내 |
| `BBOPTERS_SHARED_SKILLS_PATH` | 선택 | 저장소 내 스킬 상위 경로 (기본 `skills`) |
| `GH_TOKEN` | 공유 스킬 패널에 필요 | GitHub API 토큰 (플러그인 동기화와 공용) |

토큰이 없어도 대시보드는 뜬다. 해당 패널만 안내 카드로 바뀐다.

## 숫자를 읽을 때 알아야 할 것

- **스킬 사용량은 카탈로그에 등록된 스킬만 센다.** 카탈로그에 없는 식별자(삭제된 항목, 외부 도구 탐색)로 남은 이벤트는 가시성 판정이 불가능해 집계에서 빠진다.
- **실습 생성 엔진이 남기는 기계 트래픽(`exercise_*`)은 제외한다.** 사용자 없이 건수만 올려 "사용한 사람" 지표와 어긋난다.
- **`/stats`(복리 엔진)와 숫자가 다를 수 있다.** 복리 엔진은 MCP 감사 로그의 도구 호출을 세고, 이 대시보드는 정규화된 스킬 이벤트를 센다. 같은 사건을 두 테이블이 각각 기록하고 있어서다. 정본을 스킬 이벤트로 모으는 정리는 후속 과제.
- **금액은 통화별로만 합산한다.** 환율 환산은 하지 않는다 — 임의 환율로 만든 합계는 그럴듯하지만 검증할 수 없다.
- **구독은 시트 반영 시각을 함께 표시한다.** 오래된 데이터가 최신인 척하지 않게 하기 위함이다.

## 지금 넣지 않은 것

- **스킬별 Eval 구현 여부·품질 점수** — 평가 플랫폼 도입 게이트가 아직 안 열렸다. 트레이스·평가 결과 규격이 확정되면 패널 하나로 추가한다.
- **팀원별 AI 구독 실사용량** — Claude·ChatGPT 개인 구독은 벤더가 좌석별 사용량 API를 열어주지 않는다. 플랜과 비용까지만 다룬다.
- **OpenClaw 등 공유 계정 사용량** — 한 계정을 여러 명이 쓰는 형태라 사용자 귀속이 안 된다.
- **공유 스킬(bbopters-shared) 실행 이벤트** — 인벤토리만 연결했다. 실행 이벤트 수집·매핑 계약은 [ax-shared-skills.md](./ax-shared-skills.md)에 설계해 두었고, 사내 에이전트 쪽 구현이 붙으면 패널에 사용량이 실린다.
- **완료 세션·완주율·절감 시간·부서별 참여** — 성과 요약 패널이 "미계측 + 사유"로 명시한다. 계측 계약이 정해지면 실측 필드로 옮긴다.
