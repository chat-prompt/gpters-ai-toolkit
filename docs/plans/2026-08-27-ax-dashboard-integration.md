# AX 대시보드 고도화 통합 상태 — 2026-08-27

## 목적

기존 `feat/agent-telemetry-ingestion` 작업 폴더의 대규모 미커밋 변경을 보존하면서,
PR #33의 최신 에이전트 텔레메트리 구현 위에 대시보드 고도화를 기능 단위로 통합한다.

## 브랜치 기준

- 통합 브랜치: `feat/ax-dashboard-advanced`
- 기반 커밋: PR #33 병합 커밋 `d25d1cbd`
- PR #33은 뽀둥이 timer-triggered 수집 2회 성공 후 2026-08-27 `main`에 병합했다.
- 운영 Vercel 배포와 텔레메트리 API 인증 smoke test를 확인한 뒤 이 브랜치를 새 `main` 위로 재정렬했다.
- Vercel Preview와 Production이 동일한 `DATABASE_URL`을 공유하므로 child branch 연결 전 Preview 쓰기 검증을 금지한다.

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
- 저장소 전체 web/lib typecheck에는 기존 테스트 fixture와 `rbac.ts` 경로 별칭 부채가 남아 있다.

## 현재 외부 접근 게이트

- 로컬에는 Neon CLI/API 자격증명이 없다.
- 연결 가능한 브라우저 세션도 없어 Neon child branch를 아직 생성하지 못했다.
- Child branch URL이 준비되기 전에는 운영 DB에 `0026–0030`을 적용하지 않는다.
- 준비된 `db:migrate:ax-child` runner는 project/child/production branch ID, 15행 기준선,
  `0028` 무손실 조건을 모두 확인하고 `--apply` 없이는 변경하지 않는다.

## 다음 게이트

1. PR #34 Preview를 운영 DB가 아닌 Neon child branch에 연결
2. `0026–0030` child branch 적용 및 화면 검증
3. 실행 결과·구성원 lifecycle·사용량 backfill을 합성 데이터와 비교
4. PR #34 리뷰와 운영 반영 계획 승인
5. 승인된 migration을 운영 DB에 먼저 적용한 뒤 웹을 배포
