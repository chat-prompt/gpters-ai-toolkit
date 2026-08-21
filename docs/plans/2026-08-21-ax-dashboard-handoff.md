# AX 대시보드 — 작업 인수인계 (2026-08-19~21 사이클)

다음 에이전트(또는 사람)가 이 작업을 이어받을 때 필요한 전부를 담는다.
코드에서 읽을 수 있는 것은 반복하지 않고, **코드에 없는 결정·이유·함정**을 우선한다.

- 이 사이클의 결과: PR #31 (`857c6301`, 2026-08-21 main 머지) — 커밋 4개 squash
- 담당: 최하영 · Linear [DEV-4140](https://linear.app/geniefy/issue/DEV-4140) (In Progress) · 후속 [DEV-4221](https://linear.app/geniefy/issue/DEV-4221) (Todo)
- 운영 반영: env `BBOPTERS_SHARED_REPO` 추가 + 재배포 완료, 운영 URL에서 전 패널 실데이터 렌더 검증 완료 (2026-08-21)

## 1. 지금 화면이 어떻게 생겼나

`/ax` 는 세 층이다.

1. **상단 고정 (기간 무관)** — 스냅샷 타일 6개(누적 참여·팀 스킬·에이전트 스킬·토큰·월 구독·운영 사이트) + 52주 고정 잔디 2장(사람 aitk 스킬 사용 / 에이전트 bbopters-shared 커밋)
2. **탭 줄** — 7개 탭(성과 요약·스킬 사용량·에이전트 스킬·스킬 비교·클라이언트 사용량·구독·배포 사이트) + 기간 토글(7/30/90일)과 기간 연동 인라인 수치(기간 지원 탭에서만 표시)
3. **패널 본문** — 탭당 하나, 패널별 오류 격리

핵심 어휘 (이름 충돌을 정리한 결과이므로 바꾸지 말 것):
- **팀 스킬** = aitk 카탈로그 (사람이 씀, 502개)
- **에이전트 스킬** = `chat-prompt/bbopters-shared`의 `skills/` (에이전트가 씀, ~124개)
- 잔디 라벨의 "일별 팀 스킬(aitk) 사용"도 이 어휘를 따른다

## 2. 이 사이클에서 내린 결정과 이유

다음 작업에서 뒤집으려면 이유부터 반박할 것.

| 결정 | 이유 |
| -- | -- |
| 두 스킬 소스를 **절대 합산하지 않고** 출처로 구분 | 실측: 이름이 같은 69개 중 절반(30개)이 내용이 사실상 다른 동명이인. 히스토리(뽀짝이 확인): aitk가 원류, bbopters-shared는 운영 개선 fork + 자생 스킬 + 개명/통합 흔적 |
| 사람/에이전트를 **페이지 분리하지 않음** | 비교가 목적이라 한 시야가 낫고, 에이전트 실측 데이터가 아직 없음. 원칙: "나란히 봐야 의미 있으면 모듈, 같은 스키마의 관점 전환이면 필터" — DEV-4221 반영 계획이 이 원칙으로 적혀 있음 |
| 에이전트 잔디 = **커밋 수 프록시** | 실행 이벤트 미수집(DEV-4221). 화면 ? 툴팁이 프록시임을 명시. 실측이 붙으면 교체 |
| 잔디는 52주 **고정 창** (기간 토글 비연동) | 장기 습관 그림이라 기간을 따라가면 안 된다는 사용자 결정 |
| 미계측 지표(완주율·절감 시간·부서별 참여)는 **값 없이 사유 표시** | 이슈 완료 기준 "0이나 추정값으로 꾸미지 않는다" |
| 클라이언트 사용량 = **사람·클라이언트별 최신 보고 1건** + 14일 컷오프 | 수집기 구간이 실행일 기준 롤링이라 "전역 최신 구간" 필터는 어제 보고자를 통째로 누락시켰다(수정 전 실버그) |
| 참여율(보고 N/사내 M명)은 **근사치**로 명시 | 분자는 수집기 표시명, 분모는 계정 수 — `ax_client_usage`에 계정 식별자가 없음 |
| AX API 응답 `Cache-Control: private, no-store` | next.config가 `/api/*`에 public 캐시를 걸어 관리자 응답(개인 데이터)이 공유 캐시로 샐 수 있었음(교차 리뷰 HIGH). next.config의 `/api/ax/:path*` 규칙 + 라우트 헤더 이중 방어 |
| 개발 모드 인증 우회는 `resolveAxViewer`의 `NODE_ENV=development && DEV_BYPASS_AUTH` 이중 게이트 | 로컬에 OAuth 자격증명이 없어 세션 생성 불가. 미들웨어의 기존 패턴과 동일. 테스트가 비-dev 무시를 고정 |

## 3. 데이터 특성 — 숫자를 만지기 전에 알아야 할 것

- **시간대가 패널마다 다르다 (의도)**: 성과 요약은 KST 하루 경계(사람 단위 지표), 스킬 사용량은 UTC(기존 문서화된 선택), 에이전트 잔디는 UTC(GitHub 커밋 기준). 섞을 때 주의
- **GitHub 통계 API(`stats/commit_activity`)는 이 레포에서 202가 일상** — 에이전트들이 상시 커밋(주 100+)이라 푸시마다 통계 캐시가 무효화됨. 그래서 커밋 목록 직접 집계 폴백(60페이지 상한) + 실패도 1시간 부정 캐시가 있다. 이 구조를 단순화하고 싶으면 202 빈도부터 재측정할 것
- **스킬 비교 패널은 무겁다** — 콜드 로드에 GitHub 문서 ~120건 fetch. 1시간 캐시 + 라우트 `maxDuration=60`이 전제. 인스턴스 간 캐시 공유·in-flight 코얼레싱은 없음(알려진 한계, 트래픽 문제가 생기면 매니페스트 사전 계산으로 전환 권장)
- **모듈 레벨 캐시는 서버리스 인스턴스별**이다 (5분 인벤토리 / 1시간 비교·커밋 시리즈)
- 운영 배포 사이트 120개 vs 로컬 1개 차이는 토큰 스코프(운영은 `VERCEL_TEAM_ID` 팀 스코프)
- #30(출력 토큰 과소집계 수정) 머지 이후 팀원들의 다음 보고부터 토큰 수치가 ~25% 커진다 — 버그가 아니라 교정

## 4. 다음 작업 큐 (우선순위 순)

### A. DEV-4221 — 에이전트 실행 이벤트 (가장 큰 덩어리)

**코드보다 먼저, 선행 결정 3건** (근거: `2026-08-19-agent-usage-wiring.md` 실측):
1. 에이전트 **토큰** 사용량도 범위인가 — 봇들은 봇별 별도 계정의 Claude Code CLI(`CLAUDE_CONFIG_DIR` 분리)다. 토큰까지 하려면 수집기의 `HOME` 결합 5건 수정 + 주체 구분 설계 필요. **이 답이 나머지를 가른다**
2. 봇/사람을 한 지표에 섞나 — 봇은 크론 상시 활성이라 섞으면 "활성 인원"이 무의미해짐
3. 버전 표기 — 126개 중 4개만 frontmatter `version`. SHA 대체 vs 채우기 vs CI 매니페스트

결정 후 구현 순서는 이슈의 ①(aitk 수신부) → ②(bbopters-shared 스크립트+컨벤션 PR) → ③(운영 토큰 배포). 대시보드 반영 4건(비교 모듈·소스 필터·에이전트별 표·잔디 교체)은 이슈의 "모듈 vs 필터" 섹션 그대로.

**주의**: 구간별 합산 기능(사용량 비교 모듈 등)을 만들기 전에 `2026-08-21-usage-collector-followups.md`의 3번(스트리밍 응답 구간 경계 걸침)을 먼저 해결해야 한다. 지금은 "최신 보고만 집계" 설계 덕에 무해할 뿐이다.

### B. 수집기 후속 3건 — `2026-08-21-usage-collector-followups.md`
구간 끝 경계 `[start,end)` 확정+경계 테스트 / jsonl 성능 주석 정정 / 스트리밍 경계 걸침(위 A와 연동)

### C. 운영·사람 결정 (코드 아님)
SaaS 구독 갱신 담당 지정 · 수집 참여율 확대(현재 3/21명, Codex 훅 승인 상태 확인) · Eval 데이터 계약 · "완성" 기준 확정 · 사내 공유 · Rona AX 소유권 분리 · Vercel 페이지 허브 연결

### D. 잔재 (낮은 우선순위)
- 레포 전역 `tsc --noEmit`이 이 작업과 무관한 기존 테스트 파일에서 red (카탈로그 통합 여파, `author`→`authorId` 등) — `next build`·vitest는 통과하므로 CI는 green이지만 "TS 에러 없음" 체크리스트가 빌드 기준으로만 참
- 스킬 비교/에이전트 스킬의 동시 콜드 로드 코얼레싱, 경계 상황 테스트 보강

## 5. 로컬 개발 부트스트랩

```bash
corepack enable                      # pnpm은 corepack 경유 (전역 pnpm 없음)
pnpm install
cd apps/web && corepack pnpm exec next dev   # 반드시 apps/web에서
```

- `apps/web/.env.local`(gitignored)이 필요하다. 루트 `.env.local`의 `DATABASE_URL`(운영 Neon — 읽기 조회만 나감) + `DEV_BYPASS_AUTH=true` + `INTERNAL_ORGANIZATION_DOMAIN=gpters.org` + `NEXT_PUBLIC_BASE_URL=http://localhost:3000` + `NEXTAUTH_SECRET=아무값` + (패널용) `VERCEL_API_TOKEN`, `BBOPTERS_SHARED_REPO=chat-prompt/bbopters-shared`, `GH_TOKEN`(`gh auth token` 재사용 가능)
- 검증: `pnpm lint && pnpm test && pnpm build` — 단, **bun 미설치 머신에서는 `pnpm build`가 CLI 패키지에서 실패**하므로 `pnpm --filter @gpters/web build`로 대체(env를 source한 셸에서). **`pnpm test`는 dev 서버가 3000에 떠 있으면 API 통합 테스트 6건이 오탐**하니 서버를 내리고 돌릴 것
- 함정: dev 서버 재시작 후 브라우저가 옛 번들을 물고 있으면 화면이 코드와 어긋난다 — `Cmd+Shift+R`

## 6. 작업 컨벤션 (이 사이클에서 확립)

- 브랜치: `hychoi/dev-<이슈번호>` (rona-practice 컨벤션)
- 머지: squash (main 히스토리가 PR 단위 한 줄)
- 코드 작업 후 **교차 리뷰**: 새 컨텍스트의 Fable 세션 + `codex exec --sandbox read-only` 병렬 리뷰 → 발견 대조 → 반영 후 머지. 이번 사이클에서 실제로 HIGH(캐시 유출)를 잡았다
- Linear: 착수 시 In Progress, 커밋·머지·검증을 이슈 코멘트로 기록, 후속은 별도 이슈
- 로컬 전용이라 **커밋 금지**인 워킹트리 변경 3건: `CLAUDE.md`의 Linear 섹션, `.claude/settings.local.json`, `.env.example`의 `LINEAR_*` 블록 (브랜치 전환 시 stash 필요)
- 운영 env 변경은 사용자 확인 후에만. env 추가는 **재배포해야 반영**된다 (이번에 Vercel API로 동일 커밋 재배포함)

## 7. 문서·링크 지도

| 무엇 | 어디 |
| -- | -- |
| 대시보드 구조·패널 추가법·환경변수 | `docs/plans/ax-dashboard.md` |
| bbopters-shared 연결 계약 (버전·이벤트·매핑) | `docs/plans/ax-shared-skills.md` |
| 에이전트 사용량 실측 (HOME 결합 5건, 봇 구조) | `docs/plans/2026-08-19-agent-usage-wiring.md` |
| 수집기 후속 3건 + Deletion Test 교훈 | `docs/plans/2026-08-21-usage-collector-followups.md` |
| AX 코드 | `packages/lib/src/features/ax/` (패널) · `apps/web/components/ax/` (화면) · `apps/web/app/api/ax/` (라우트) |
| 테스트 | `apps/web/tests/unit/ax-*.test.ts` (패턴: db/fetch 모킹 + fake timers — 날짜 상수 쓰면 반드시 시계 고정) |
| 데이터 리니지 문서 (아티팩트, 팀 공유 가능) | claude.ai/code/artifact/ac63b66e-5049-4f59-9988-29b600844105 |
| 대시보드 스냅샷 (모바일 확인용, 재생성 스크립트는 세션 스크래치) | claude.ai/code/artifact/a1cd75bf-f23a-44db-a5ea-fe4eb3810d3e |
