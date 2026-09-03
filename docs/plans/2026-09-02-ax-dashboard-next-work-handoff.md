# AX 대시보드 다음 작업 인수인계 — 2026-09-02

이 문서는 AX 대시보드 UI 고도화 작업을 다른 에이전트가 이어받기 위한 현재 정본이다.
8월 인수인계 문서에는 커밋 프록시, 과거 탭 구성 등 이미 교체된 내용이 있으므로 역사적 참고로만 본다.

## 1. 현재 작업 상태

- 저장소: `/Users/hychoi/Projects/Geniefy/gpters-ai-toolkit`
- 브랜치: `feat/ax-agent-dashboard-ui` (origin/main 위로 rebase 완료)
- 2026-09-02 진행 상황
  - 직전 워킹트리 작업(주황 팔레트·365일 잔디 2장·에이전트 스킬 활용 요약)과 §5의 **P0 지표 신뢰도**를
    한 커밋(`feat(ax): show denominator reliability alongside conversion rates`)으로 묶었다.
    아직 PR·운영 배포는 하지 않았다.
  - 헤더·OrgSwitcher·UserMenu·AdminQuickMenu의 `xl` 미만 축약 변경은 AX 범위 밖이라 커밋하지 않고
    워킹트리에 남겨 두었다. 375px에서 헤더 요소가 겹치므로 별도로 다듬어야 한다.
  - 관련 Linear 이슈: DEV-4276(정기 점검용 지표 세트 정의와 배치) In Progress. DEV-4140·DEV-4221도 열려 있다.
- 로컬 확인 주소: `http://127.0.0.1:3000/en/ax`
- 로컬 화면은 운영 DB를 **읽기 전용**으로 조회한다. 운영·공유 DB를 변경하는 API/E2E 테스트를 실행하지 않는다.
- `.claude/settings.local.json`은 사용자 로컬 변경이다. 이 작업에서 수정하거나 되돌리지 않는다.

현재 주요 변경 파일:

- `apps/web/components/ax/AxDashboard.tsx`
- `apps/web/components/ax/format.ts`
- `apps/web/components/ax/panels/OverviewPanel.tsx`
- `apps/web/components/ax/panels/SkillUsagePanel.tsx`
- `apps/web/components/ax/panels/AgentActivityPanel.tsx`
- `apps/web/components/ax/panels/JourneyInsightsPanel.tsx`
- `packages/lib/src/features/ax/overview.ts`
- `packages/lib/src/features/ax/agent-activity.ts`
- `packages/lib/src/features/ax/types.ts`
- `apps/web/tests/unit/ax-*.test.ts(x)` (`ax-journey-insights-view.test.tsx` 신규)

## 2. 확정된 제품·디자인 결정

### 전체 구조

- 최상위 탭은 `요약 / 스킬 / 클라이언트 / 배포 사이트`다.
- 기간 필터는 우측 상단 `7일 / 30일 / 90일`이며 기본값은 7일이다.
- 기간 문구를 각 패널 제목에 반복하지 않는다.
- 요약은 사람 중심, 스킬 상세는 스킬 탭, 에이전트 상세는 스킬 탭의 `에이전트 활동` 세부 탭에 둔다.

### 요약 탭

- 상단 핵심 수치: 활성 구성원, 실제 적용 호출, 1인당 적용.
- `일별 사용 인원`, `시간대별 사용 인원 (KST)`, `사용자별 스킬 활용`을 같은 시각 위계로 보여준다.
- 사용자 표는 기존 사용량 정렬을 유지하고 `고유 스킬 수`와 마지막 활동을 표시한다.
- 로드·적용 수치는 행의 접근 가능한 라벨/호버 정보로 남기고 상시 컬럼으로 반복하지 않는다.
- 중간의 반복적인 `구성원의 AX 활동`, 장기 활동 설명, 내부 데이터 출처 문구는 제거했다.
- 화면 맨 아래에는 기간 필터와 무관한 최근 365일 잔디 두 개를 유지한다.
  - 일별 구성원 스킬 활동: 실제 적용 이벤트
  - 일별 에이전트 사용량: 커밋 프록시가 아니라 수집된 실제 에이전트 턴
- 24시간을 초과하는 에이전트 backfill 배치는 일별 분포를 알 수 없으므로 잔디에 억지로 배분하지 않는다.

### 스킬 탭

- 상단 세부 탭: `구성원 사용 / 탐색·결과 분석 / 에이전트 활동 / 보유 스킬 / 팀 스킬과 비교`.
- 구성원 사용의 상단 요약과 일별 스킬 활동 그래프를 먼저 보여준다.
- 일별 스킬 활동은 다음 세 신호를 구분한다.
  - 로드 없이 적용
  - 로드
  - 로드 후 적용
- 스킬별 표는 막대 길이로 실제 적용량을 유지하고, 활성 사용자 중 적용 비율은 소수점 한 자리까지 표시한다.
- 전체 적용 중 비율 같은 중복 수치는 상시 컬럼이 아니라 필요할 때 호버 정보로 제공한다.

### 색상·상호작용

- 데이터 팔레트는 **주황 계열**이 최종 결정이다. 청회색으로 바꾸지 않는다.
- 활동량은 `var(--accent-orange)`를 `var(--bg-tertiary)`와 섞어 최솟값 30%에서 최댓값 100%까지 표현한다.
- 상대 농도는 제곱근 곡선을 사용해 작은 값 차이도 보이게 한다.
- 로드는 중립 회색, 로드 없이 적용은 연한 주황, 로드 후 적용은 선명한 주황이다.
- 호버 시 막대가 움직이거나 확대되지 않는다. 색상/외곽선과 툴팁만 변한다.
- 밝은·어두운 테마 모두에서 범례 간격, 막대 대비, 텍스트 잘림, 가로 스크롤을 직접 확인해야 한다.

### 패널 디자인 어휘 (2026-09-02 통일)

- 정본은 `apps/web/components/ax/panels/primitives.tsx`다. 새 패널이나 섹션은 여기 있는 조각부터 쓴다.
  - 섹션 머리: `SectionHeader`(모노 11px 대문자 라벨 + 오른쪽 보조 문구 + 선택 설명). 눈썹+굵은 제목 2줄 헤더는 쓰지 않는다.
  - 수치: `StatGrid`/`Stat`(열린 격자, 라벨 text-xs · 값 font-mono xl · 보조 문구 · `?` 도움말). `gap-px` 칸막이 타일과 테두리 카드는 쓰지 않는다.
  - 표: `TH`/`TD`/`NumberCell`, 빈 상태: `EmptyNote`, 제목·설명 목록: `DefinitionRows`.
  - 순위·비중 막대는 `relativeActivityFill`을 이름 칸 안에 깐다(스킬별 실제 적용 표와 같은 방식).
- 패널 루트 간격은 `space-y-10`으로 통일한다.

색상 구현 정본:

- 상대 활동색: `relativeActivityFill()` in `apps/web/components/ax/format.ts`
- 스킬 흐름색: `FLOW_DIRECT_COLOR`, `FLOW_LOAD_COLOR`, `FLOW_CONVERTED_COLOR` in `AxDashboard.tsx`
- 호버 강조: `var(--brand-secondary)`

## 3. 숫자의 정확한 의미

- 검색 노출은 사용으로 보지 않는다.
- 로드는 스킬 지침을 불러온 신호이며 실제 적용과 다르다.
- 실제 사용은 명시적인 `apply` 보고를 기준으로 한다.
- `로드 후 적용`은 같은 사용자·흐름(journey, 없으면 session)·스킬의 앞선 로드와 연결할 수 있는 적용이다.
  일별 잔디·흐름 차트에서는 **로드 코호트 단위로 로드 날짜에 귀속**하고 코호트당 한 번만 센다.
  적용 날짜 기준 이벤트 수로 세면 기간 전 로드·반복 적용 때문에 전환율 분자가 분모를 넘을 수 있어 2026-09-02 교차 리뷰에서 바꿨다.
- `연결 가능 로드`는 위 코호트 중 flow ID와 user ID가 모두 있는 것이다. 전환율 분모는 전체 로드가 아니라 이 값이다.
- `로드 없이 적용`에는 서버 호출 없이 로컬에 저장된 스킬을 재사용한 경우 등이 포함될 수 있다.
- 세션 ID 없는 과거 CLI 로드는 적용과 정확히 연결할 수 없으므로 전체 로드 수에는 포함하되 전환율 분모에는 주의한다.
- 에이전트 thinking 토큰이 output에 포함되는지는 `thinkingTokensRelation`을 따른다. `included-in-output`이면 총량에 다시 더하지 않는다.
- 사람과 에이전트는 같은 활성 인원 지표에 합치지 않는다.

## 4. 이미 수집되지만 충분히 활용하지 않는 데이터

새로운 수집 파이프라인부터 만들지 말고 아래 기존 계약을 먼저 활용한다.

### 탐색·전환·결과

`AxJourneyInsightsData`에 이미 존재한다.

- 관측/미관측 검색 수
- 검색 결과 0건 수와 비율, 실제 질의 목록
- 검색 노출 → 로드 전환율
- 로드 → 적용 판단 보고율
- 적용/미적용/미보고 결과 커버리지
- 확인된 적용률
- 실행 시도, 완료, 성공, 부분 성공, 실패, 중단
- 자기보고 성공률과 검증 성공률
- 평균 실행 시간
- 스킬별 결과 집계와 미적용 사유

### 구성원 사용

`AxOverviewData`와 `AxSkillUsageData`에 이미 존재한다.

- 일별 고유 실제 사용자
- 시간대별 실제 사용자
- 사용자별 로드·적용·고유 적용 스킬 수
- 스킬별 검색·로드·적용·사용자 수
- 기간 내 미사용 스킬 수

### 에이전트 효율·수집 건강도

`AxAgentActivityData`에 이미 존재한다.

- 에이전트/모델별 처리 토큰, 세션, 턴
- 도구 호출과 실패율
- 스킬 로드·실패·중단
- 검증된 실행 성공과 선행 로드 연결 여부
- 수집기별 최신성, 건강 상태, 지원 capability
- parse failure와 unsupported record 수

## 5. 권장 다음 작업 순서

### P0. 지표 신뢰도와 수집 상태 — 2026-09-02 구현 완료

전환율을 더 크게 보여주기 전에 분모의 신뢰도를 함께 보여준다.

- [x] 연결 가능한 로드 비율 — 잔디 일별 집계에 `linkableLoads`(journey·session ID와 user ID가 있는 로드 코호트) 추가.
  `appliedAfterLoad`도 같은 코호트 키로 세어 분자가 분모의 부분집합이 되게 했다(Codex 리뷰 blocker 반영).
  스킬 탭 일별 흐름 차트 위 `FlowDenominatorNote`가 "로드 N건 중 연결 가능 M건 · 로드 후 적용은 연결 가능
  로드의 x%"를 보여주고, 막대 툴팁·aria-label의 전환율 분모도 연결 가능 로드로 바꿨다.
  구형 응답(`linkableLoads` 없음)은 전체 로드로 물러나되 "전체 로드"라고 적는다.
- [x] 결과 보고 커버리지·관측되지 않은 검색 비중 — 탐색·결과 분석에 `ReliabilityStrip`(분모 신뢰도) 띠 추가.
  결과 배열 미기록 검색 비중, 적용 여부 기록 커버리지, 검증 결과가 있는 완료, 백분율 표시 기준.
- [x] 표본이 작을 때 — `formatSampledRate(n, d, min = RATE_MIN_SAMPLE = 10)`. 분모 0은 대시, 10건 미만은
  `n/d · 참고`, 그 외 소수점 한 자리 백분율. 에이전트 활동 로드→검증 성공, 탐색·결과 분석의 퍼널·실행 성공률·
  확정 적용률·스킬별 기록률에 적용했다. 사람 수 기반 비율(활성 사용자 중 적용)은 이미 `n/d명`을 함께 보여주므로
  적용하지 않았다.
- [ ] 에이전트 수집기 최신성·stale·blocked — 에이전트 활동 탭의 `CollectorStatus`·인사이트가 이미 다루고 있어
  이번 단위에서는 손대지 않았다. 요약 탭에서 한눈에 보이게 할지는 P1 에이전트 효율과 함께 결정한다.

완료 기준(충족):

- 사용자가 전환율이 전체 이벤트 기준인지 연결 가능한 표본 기준인지 구분할 수 있다.
- 수집 누락과 실제 0건을 같은 의미로 표시하지 않는다.

남은 판단: 24시간 초과 backfill 배치가 에이전트 잔디에서 제외된 사실을 잔디 카드에 표시할지(현재는 문서에만 있음).

### P1. 스킬 개선 기회 자동 분류

기존 데이터로 다음 분류를 만든다.

1. 검색은 많고 로드가 적음 → 제목·설명·검색 키워드 개선
2. 로드는 많고 적용이 적음 → 지침·예시·품질 개선
3. 적용은 많고 사용자가 적음 → 사내 확산 후보
4. 검색 결과 0건 → 신규 스킬 후보
5. 결과 미보고가 많음 → 계측 개선 또는 판단 보류
6. 실패·중단이 많음 → 실행 안정성 개선

초기에는 복잡한 종합 점수 하나보다 분류별 목록과 근거 수치를 우선한다.

### P1. 에이전트 효율

- 검증 성공 1건당 처리 토큰
- 에이전트·모델별 검증 성공률
- 도구 실패율과 실패가 많은 도구
- 스킬별 실패·중단률
- 수집이 끊긴 에이전트와 마지막 정상 보고

비용은 모델 가격표와 구독 사용량의 대표성이 확보된 뒤 추가한다. 현재 토큰만으로 회사 전체 비용처럼 표현하지 않는다.

### P2. 반복 사용과 정착률

현재 화면에 없는 핵심 지표다. 이벤트 시계열에서 파생 집계를 추가한다.

- 지난주 사용자 중 이번 주에도 사용한 비율
- 신규 사용자와 재사용자
- 스킬별 7일·30일 재사용률
- 한 번만 사용한 스킬과 반복 사용 스킬
- 사용자별 다양성뿐 아니라 반복 깊이

조직 규모가 약 12명이므로 부서별 분해나 복잡한 조직 벤치마크보다 개인 식별을 숨긴 팀 단위 정착률을 우선한다.

### P2. 성과·비용 정규화

- 검증 성공 1건당 토큰
- 적용 1건당 토큰
- 모델별 성공률 대비 처리량
- 추후 일 1회 구독 사용량 집계가 안정화되면 구독 소진율과 결합

`apply` 또는 검증 성공은 업무 가치 자체가 아니다. 절감 시간이나 ROI를 임의 추정하지 않는다. 실제 성과가 필요하면 별도 평가/증거 계약을 설계한다.

## 6. 대시보드 자체 성능 최적화

현재 첫 진입 시 보이지 않는 탭의 API도 동시에 요청한다. 로컬 서버 로그에서 `overview`, `skill-usage`,
`journey-insights`, `agent-activity`, `shared-skills`, `skill-diff`, `client-usage`, `subscriptions`,
`vercel-deployments`가 한꺼번에 호출되는 것을 확인했다.

권장 순서:

1. 현재 최상위 탭과 활성 세부 탭의 패널을 우선 로드한다.
2. 나머지는 첫 화면 안정 후 백그라운드 로드하거나 탭을 열 때 로드한다.
3. 7/30/90일 응답을 패널별로 캐시하고 이미 받은 기간은 재사용한다.
4. 기간을 빠르게 바꿀 때 이전 요청을 취소한다.
5. 365일 잔디와 커지는 텔레메트리 집계는 일별 요약을 사전 계산하는 방안을 검토한다.
6. 최적화 전후 API별 응답 시간과 첫 의미 있는 패널 표시 시간을 측정한다.

기간 비연동 패널을 기간 변경 때 다시 요청하지 않는 로직은 이미 구현되어 있으므로 회귀시키지 않는다.

## 7. 검증 상태와 명령

마지막 검증 (2026-09-02, P0 커밋 기준):

- AX 관련 단위 테스트: 9 files / 37 tests 통과 (`ax-journey-insights-view.test.tsx` 포함)
- 밝은·어두운 테마 브라우저 시각 검증 통과 — 375 / 1280 / 1920px, 요약·스킬·탐색·결과 분석·에이전트 활동
- 일별 흐름 차트의 첫·마지막 막대 툴팁이 화면 밖으로 잘리던 문제를 `tooltipAnchorClass`로 고침
- `git diff --check` 통과, `@gpters/web` production build 통과
- `@gpters/lib typecheck`는 `src/security/rbac.ts`의 기존 경로 별칭 오류 7건으로 red. `features/ax` 오류는 없음
- 새 Fable 세션 + `codex exec --sandbox read-only` 교차 리뷰 완료. 반영: 코호트 기반 전환율, 분모 정의 정합(user_id·turns>0),
  10건 규칙 통일(에이전트 표·도구 실패율), 실행 결과 테이블 부재 시 `미관측`, 팝오버·툴팁 잘림, 접근성 nit.
  미반영: 24h backfill 임계 하향 검토(nit), 실행 수 필터를 탐색·결과 분석과 통일할지(문구로만 명시).

대상 테스트:

```bash
corepack pnpm --filter @gpters/web exec vitest run \
  tests/unit/ax-format.test.ts \
  tests/unit/ax-overview-panel-view.test.tsx \
  tests/unit/ax-skill-usage-panel-view.test.tsx \
  tests/unit/ax-dashboard-loading.test.tsx \
  tests/unit/ax-overview-panel.test.ts \
  tests/unit/ax-agent-activity-panel.test.ts \
  tests/unit/ax-agent-activity-view.test.tsx \
  tests/unit/ax-journey-insights-panel.test.ts \
  tests/unit/ax-journey-insights-view.test.tsx
```

로컬 서버:

```bash
corepack pnpm --filter @gpters/web exec dotenv -e ../../.env.local -- \
  next dev -H 127.0.0.1 -p 3000
```

주의:

- `@gpters/web typecheck`는 이번 AX 변경과 무관한 기존 테스트 타입 오류가 다수 남아 있어 red다.
  예: `author`→`authorId`, 테스트 matcher 타입, MCP response unknown. AX 대상 테스트와 production build로 회귀를 확인한다.
- 빌드가 Google Fonts 네트워크 차단으로 실패하면 네트워크를 허용한 환경에서 다시 검증한다.
- API/E2E 전체 테스트는 운영·공유 DB를 바라보는 서버에서 실행하지 않는다.
- UI 변경은 단위 테스트만으로 완료하지 않고 데스크톱 밝은·어두운 테마를 직접 본다.

## 8. `Geniefy` 경로 주의

폴더명이 `Geniepy`에서 `Geniefy`로 바뀐 뒤 Next/Turbopack 캐시의 절대 경로 때문에 옛
`/Users/hychoi/Projects/Geniepy` 디렉터리가 다시 생성된 적이 있다.

현재 처리 상태:

- 옛 디렉터리와 당시 `.next` 캐시는 삭제하지 않고 `/tmp`로 이동했다.
- 현재 dev 서버와 `.next`는 `Geniefy` 경로에서 새로 생성했다.
- 현재 `.next` 텍스트·소스맵에 옛 절대 경로가 없고 `Geniepy` 디렉터리도 재생성되지 않았다.
- `codex-hychoi-geniepy` 같은 텔레메트리 collector ID는 파일 경로가 아니라 연속성 식별자다.
  이름만 정리하려고 바꾸면 checkpoint/dedup 연속성이 깨질 수 있으므로 별도 마이그레이션 없이 변경하지 않는다.

## 9. 새 에이전트의 첫 작업 체크리스트

1. 이 문서와 저장소 루트 `AGENTS.md`를 읽는다.
2. 워킹트리에서 `.claude/settings.local.json`을 제외한 현재 diff를 검토한다.
3. localhost 화면을 밝은·어두운 테마로 확인한다.
4. P0는 완료됐으므로 P1(스킬 개선 기회 자동 분류 → 에이전트 효율)부터 작은 단위로 구현한다.
5. 새 원시 이벤트 수집이 정말 필요한지 기존 `AxJourneyInsightsData`와 `AxAgentActivityData`를 먼저 확인한다.
6. 화면 문구나 그래프를 바꿀 때 AX 대상 테스트와 브라우저 시각 검증을 함께 수행한다.
7. 운영 배포, DB 변경, 백필은 별도 사용자 승인 전에는 실행하지 않는다.

