# AX 0026–0030 마이그레이션 실행 가이드

이 문서는 AX 대시보드의 수집 참여·퇴사자 처리·사용량 사용자 연결·실행 결과를 위한 다섯
후속 마이그레이션을 격리 환경에서 검증하고, 나중에 운영에 반영하는 순서를 정리한다.

## 현재 기준선

- 운영에는 `0025_ax_agent_telemetry_batches.sql`이 적용되어 있다.
- 운영 `drizzle.__drizzle_migrations`는 텔레메트리 적용 뒤 15행이다.
- 과거 `0015–0024`가 만든 주요 객체는 운영에 있지만 Drizzle 이력에는 소급 등록하지 않는다.
- 이 브랜치는 운영 `0025`를 유지하고 로컬 초안의 번호를 한 칸 뒤로 이동했다.
- 2026-08-27 읽기 전용 확인에서 아래 다섯 후속 객체는 운영에 아직 없었다.
- 운영 DB 비밀번호 회전은 2026-08-26 완료됐다. 비밀번호 값은 문서나 Git에 남기지 않는다.

## 마이그레이션

| 파일 | 목적 | 데이터 영향 |
| --- | --- | --- |
| `0026_ax_usage_collector_state.sql` | 사용량이 0이어도 수집기 heartbeat 저장 | 새 테이블·인덱스 |
| `0027_member_lifecycle.sql` | 계정 정지와 조직 퇴사를 삭제 대신 상태로 보존 | 기존 행은 `active` 기본값 |
| `0028_ax_client_usage_user_id.sql` | 표시명 대신 인증 `user_id`로 사용량 소유자 연결 | 유일한 이름/이메일만 백필하고 중복 가능 |
| `0029_ax_skill_execution_attempts.sql` | 명시 실행 결과와 검증 근거 저장 | 새 enum과 실행 시도 테이블 |
| `0030_ax_execution_lifecycle.sql` | 안정적인 agent ID 및 시작·완료 이벤트 연결 | 기존 완료 행 백필과 이벤트 테이블 |

`0028`만 기존 사용량 행을 삭제할 수 있다. 적용 직전 프리플라이트의
`rows_deleted_by_dedupe`가 0보다 크면 자동 진행하지 않고, 삭제·보존 대상 ID를 별도 검토한다.

## 1. 격리 환경

전용 Colima 프로필과 PostgreSQL 17/pgvector 환경을 사용한다.

```bash
colima start --profile gpters-ax --runtime docker --vm-type vz --cpu 2 --memory 4 --disk 24
pnpm ax:local:up
pnpm ax:local:status
pnpm ax:local:verify-rebuild
```

로컬 DB는 `127.0.0.1:55432`, 웹은 `http://localhost:3002`를 사용한다.
`apps/web/.env.ax-local`에는 로컬 연결만 넣고 운영 Neon 연결 문자열을 넣지 않는다.

## 2. 읽기 전용 프리플라이트

```bash
pnpm --filter @gpters/db db:preflight:ax -- \
  --env-file ../../apps/web/.env.ax-local
```

확인 항목:

- 대상이 `local` 또는 명시적으로 만든 Neon 개발 branch인지
- `0026/0027/0028/0029/0030` 상태
- `ambiguous`, `unmatched`, `rows deleted by dedupe`
- 복구 지점 또는 즉시 폐기 가능한 child branch 존재 여부

프리플라이트는 조회만 수행하며 연결 문자열이나 비밀번호를 출력하지 않는다.

2026-08-27 운영 프리플라이트 결과는 `0026–0030` 모두 pending, 사용량 48행 모두
유일 매칭, ambiguous 0, unmatched 0, duplicate 0, dedupe 삭제 0이었다.

## 3. 적용 순서

```text
0025_ax_agent_telemetry_batches.sql   # 운영 적용 완료, 격리 재구축에서만 처음부터 실행
0026_ax_usage_collector_state.sql
0027_member_lifecycle.sql
0028_ax_client_usage_user_id.sql
0029_ax_skill_execution_attempts.sql
0030_ax_execution_lifecycle.sql
```

운영에서는 이미 적용된 `0025`를 다시 실행하지 않는다. 후속 적용 순서는
`0026 → 0027 → 0028 → 0029 → 0030`이다. Child branch에서는 범용
`db:migrate` 대신 production branch 거부 장치가 있는 전용 runner를 사용한다.

```bash
pnpm --filter @gpters/db db:migrate:ax-child -- \
  --env-file ../../apps/web/.env.ax-child \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID"
```

첫 실행은 조회·검증만 하고 변경하지 않는다. 아래 조건을 모두 통과해야 같은 명령 끝에
`--apply`를 붙일 수 있다.

- 실제 project/branch ID가 명시한 child branch와 일치
- 실제 branch가 production branch와 다름
- Drizzle 이력 15행, 최신 timestamp가 운영 `0025`
- `0026–0030` 객체가 하나도 없는 깨끗한 적용 전 상태
- `0028` ambiguous·unmatched·duplicate·삭제가 모두 0

적용 뒤 runner는 Drizzle 이력 20행, 최신 `0030`, 여섯 후속 객체 존재를 다시 확인한다.
중간 상태나 이미 일부 적용된 branch는 자동 진행하지 않고 새 child branch로 다시 시작한다.

저널의 후속 항목 timestamp는 운영 `0025`보다 크게 잡혀 있으므로, 감사한 15행 기준선에서는
후속 다섯 개만 대상이 된다. 그래도 `0028`의 데이터 정리 영향 때문에 운영에서 범용
`db:migrate`를 바로 실행하지 않고 프리플라이트 결과를 보존한 뒤 승인된 절차로 적용한다.

## 4. 격리 검증

```bash
pnpm ax:local:verify-rebuild
pnpm ax:local:preflight
pnpm ax:local:dev
```

확인 항목:

- 9개 AX 패널 API가 HTTP 200이고 각 패널이 독립적으로 렌더되는가
- 상단 카드가 4열 두 줄로 배치되는가
- 구성원 수집 상태와 마지막 보고 시각이 표시되는가
- 퇴사 처리 계정이 현재 분모에서는 빠지고 과거 기록은 남는가
- 새 사용량 행이 `user_id`에 연결되고 같은 구간 재보고가 중복되지 않는가
- 실행 시작·완료, 장기 미완료, 검증 근거가 구분되는가
- 에이전트 텔레메트리와 명시 실행 결과가 서로 중복 합산되지 않는가

## 5. 운영 반영 게이트

1. PR #33을 `main`에 병합해 현재 텔레메트리 운영 코드를 Git 정본으로 만든다.
2. 운영 DB의 텔레메트리 전용 프리플라이트가 여전히 `applied`인지 확인한다.
3. Neon 복구 지점 또는 child branch를 만든다.
4. 이 문서의 AX 프리플라이트 결과와 `0028` 영향도를 보관한다.
5. child branch에서 `0026 → 0030`을 적용하고 웹 Preview를 검증한다.
6. 별도 승인 후 운영 DB에 같은 순서로 적용한다.
7. 스키마 사후 검증 후 서버 코드를 배포한다.
8. 7일 동안 heartbeat·미보고자·수집 오류·실행 결과 누락을 모니터링한다.

현재 Vercel의 `DATABASE_URL`은 Preview와 Production이 같은 전역 항목을 공유한다.
PR #34 검증 전에 child branch URL을 해당 Git branch 전용 Preview 환경 변수로 등록해야 하며,
그 전에는 Preview에서 migration runner나 쓰기 검증을 실행하지 않는다.

뽀둥이 등 에이전트의 실제 수집기 설치와 이 DB 마이그레이션은 독립된 작업이다. 에이전트가
오프라인이어도 격리 검증과 Preview 준비는 진행할 수 있지만, PR #33의 연속 timer 2회 성공
게이트는 실제 에이전트가 온라인일 때만 완료할 수 있다.
