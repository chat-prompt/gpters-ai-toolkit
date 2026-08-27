# AX 대시보드 고도화 통합 상태 — 2026-08-27

## 목적

기존 `feat/agent-telemetry-ingestion` 작업 폴더의 대규모 미커밋 변경을 보존하면서,
PR #33의 최신 에이전트 텔레메트리 구현 위에 대시보드 고도화를 기능 단위로 통합한다.

## 브랜치 기준

- 통합 브랜치: `feat/ax-dashboard-advanced`
- 기반 커밋: PR #33 병합 커밋 `d25d1cbd`
- PR #33은 뽀둥이 timer-triggered 수집 2회 성공 후 2026-08-27 `main`에 병합했다.
- 운영 Vercel 배포와 텔레메트리 API 인증 smoke test를 확인한 뒤 이 브랜치를 새 `main` 위로 재정렬했다.
- PR #34 Preview에는 브랜치 한정 `DATABASE_URL`을 등록해 Production과 DB를 분리했다.

## 통합한 기능

- 업무 영역별 대시보드와 키보드 접근 가능한 내부 보기
- 4열 두 줄 스냅샷
- 검색 → 상세 확인 → 적용 판단 탐색 인사이트
- 수집 heartbeat와 구성원별 보고 상태
- 계정 정지·조직 퇴사 soft-deactivation
- 클라이언트 사용량의 인증 `user_id` 연결
- 스킬 실행 시작·완료·검증 결과
- 에이전트 4개 소스 커버리지와 검증 실행 결과의 분리 표시
- 운영과 분리된 Colima/PostgreSQL 합성 재구축 환경

## DB 기준선 정리

운영에 적용된 `0025_ax_agent_telemetry_batches.sql`을 유지하고 기존 로컬 초안을 다음처럼 이동했다.

| 기존 로컬 번호 | 통합 번호 |
| --- | --- |
| 0025 사용량 collector state | 0026 |
| 0026 구성원 lifecycle | 0027 |
| 0027 사용량 user ID | 0028 |
| 0028 실행 시도 | 0029 |
| 0029 실행 lifecycle | 0030 |
| 0030 에이전트 telemetry | 운영 0025 사용 |

운영에는 후속 `0026–0030`을 아직 적용하지 않는다. 자세한 절차는
[마이그레이션 실행 가이드](./2026-08-25-ax-migration-runbook.md)를 따른다.

## 의도적으로 제외한 로컬 변경

- `.claude/settings.local.json` 개인 설정
- Linear 개인 API 키 설명
- 오래된 `HANDOFF.md` 상태 복제
- 과거 프로젝트 개요 archive
- PR #33보다 오래된 에이전트 활동 패널·테스트 구현

위 항목은 원래 작업 폴더에 그대로 보존되어 있으며 통합 브랜치가 덮어쓰지 않는다.

## 검증

- DB TypeScript: 통과
- AX·MCP·인증 집중 테스트: 19 files / 320 tests 통과
- Web 전체 테스트: 97 files / 2,517 tests 통과
- 격리 `gpters_ax_rebuild`: 0000–0030 전체 재구축 통과
- 합성 데이터: 사용자 21, 활성 구성원 20, 스킬 60, 이벤트 87, 사용량 3,
  실행 시도 6, 텔레메트리 batch 5
- 로컬 DB 프리플라이트: 0026–0030 객체 존재, 0028 모호·미연결·중복 삭제 0
- Next.js Production build: 73 static pages 및 TypeScript 통과
- PR #33 운영 배포: main CI 4개 job, Vercel production Ready, 운영 API 무인증 요청 401 통과
- 운영 DB 확인: 뽀둥이 timer 배치 2개가 `healthy`, `gap=0`, 15턴·31턴으로 저장됨
- 운영 AX preflight: 사용량 48행 유일 매칭, ambiguous·unmatched·duplicate·삭제 모두 0
- Child migration guard: 5개 단위 테스트 통과, 실제 운영 branch 무변경 거부 확인
- Neon child `ax-dashboard-pr34-20260827`를 production의 시점 복제로 생성하고 `0026–0030` 적용 완료
- Child 적용 후 migration 20행, 사용량 48행 유지, ambiguous·unmatched·삭제 0 확인
- PR #34 브랜치 한정 Vercel Preview `DATABASE_URL` 등록 및 재배포 `Ready` 확인
- Child DB 실조회: overview·skill-usage·journey-insights·agent-activity·client-usage·subscriptions 6개 패널 모두 `ok`
- 에이전트 활동 실조회: reporter 1, source coverage 4, model 2, tool 19, skill load 4종 확인
- 저장소 전체 web/lib typecheck에는 기존 테스트 fixture와 `rbac.ts` 경로 별칭 부채가 남아 있다.

## 현재 Preview 상태

- Neon child ID: `br-cold-smoke-a1jh3bmc` (부모: production)
- 자동 삭제: 2026-08-28 12:10 KST
- 연결 문자열은 macOS Keychain과 Vercel Sensitive 환경변수에만 저장하며 문서·로그에는 남기지 않는다.
- 브랜치 한정 환경변수가 전역 Preview/Production 값보다 PR #34에서만 우선한다.
- Vercel Preview는 `Ready`지만 공용 `AUTH_URL`이 운영 도메인을 가리켜 브라우저 로그인 시 운영으로 이동한다.
  따라서 현재 검증은 child DB 대상 패널 로더 실조회까지 완료했고, Preview UI 로그인 동선은 별도 설정이 필요하다.
- 운영 DB에는 `0026–0030`을 적용하지 않았다.

## 다음 게이트

1. Preview 전용 인증 URL/Google OAuth callback을 준비하거나, 승인된 다른 방법으로 PR 화면을 시각 검증
2. 실행 결과·구성원 lifecycle·사용량 backfill을 child 데이터와 합성 데이터로 최종 비교
3. PR #34 리뷰와 운영 반영 계획 승인
4. 승인된 migration을 운영 DB에 먼저 적용한 뒤 웹을 배포
