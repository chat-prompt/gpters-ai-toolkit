# AX 0034 수집기 기본 주기 마이그레이션

`0034_agent_collector_hourly_default.sql`은 `ax_agent_telemetry_collectors.interval_seconds`의
컬럼 기본값을 21600(6시간)에서 3600(1시간)으로 바꾼다. **기존 행은 바꾸지 않는다.**

사내 에이전트는 상시 가동이고 대시보드는 두 주기가 지나야 stale로 보므로, 새 설치가 처음부터
1시간으로 등록되게 한다. 사람의 사용량 보고(`aitk usage report`)는 하루 한 번 그대로다.

## 적용 결과 (2026-09-03 완료)

운영에 적용을 마쳤다.

| | 적용 전 | 적용 후 |
| -- | -- | -- |
| 기록된 마이그레이션 | 23건 (마지막 0033) | 24건 (마지막 0034) |
| `interval_seconds` 기본값 | `21600` | `3600` |
| 등록된 수집기 | 2개 모두 3600 | 2개 모두 3600 (불변) |

- 운영 브랜치 `br-muddy-sea-a1znovvl`, 프로젝트 `floral-wave-70284131`
- 복구 브랜치 `pre-ax-0034-prod-20260903`(`br-royal-moon-a1re70ui`)을 운영 데이터·스키마로 먼저 만들었다.
  Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다 — 이전 0031~0033과 같은 방식이다.
- 기존 수집기가 이미 1시간이므로 적용 전에도 운영 동작은 정상이었다. 이 마이그레이션은 앞으로의 새 설치가
  기본값을 그대로 쓰게 만드는 정리 작업이다. 등록 API가 `intervalSeconds`를 필수로 검증하므로 기능 영향은 없다.

## 가드

`packages/db/src/migration/agent-collector-interval-guard.ts`가 적용 전후를 검증한다.
`drizzle`의 `migrate()`는 미적용 마이그레이션을 모두 적용하므로, 기준선을 preflight에서 막지 않으면
0032·0033까지 함께 적용된 뒤에야 사후 검증이 실패한다.

적용 전 요구 조건:

- 마이그레이션 정확히 23건, 마지막이 0033
- `ax_agent_telemetry_collectors` 존재 (0031 적용됨)
- 컬럼 기본값이 아직 3600이 아님
- child 모드는 운영 브랜치를 거부하고, production 모드는 운영과 다른 recovery 브랜치를 요구

적용 후 요구 조건:

- 마이그레이션 24건, 마지막이 0034(`1788414275714`)
- 컬럼 기본값 3600
- 수집기 interval 분포가 적용 전과 동일 (기본값만 바뀌어야 한다)

## Neon 자식 브랜치

```sh
pnpm --filter @gpters/db db:migrate:collector-interval-child -- \
  --env-file ../../apps/web/.env.ax-child \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID"
```

읽기 전용 preflight 결과를 확인한 뒤 같은 명령에 `--apply`를 덧붙인다.

## 운영

운영은 직전에 현재 운영 데이터·스키마로 만든 recovery 브랜치와 두 번째 확인 문자열을 요구한다.

```sh
pnpm --filter @gpters/db db:migrate:collector-interval-production -- \
  --env-file ../../apps/web/.env.production.local \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID" \
  --recovery-branch-id "$AX_NEON_RECOVERY_BRANCH_ID"
```

읽기 전용 결과를 검토한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-ax-0034
```

## 되돌리기

컬럼 기본값만 바뀌므로 되돌리기는 한 문장이다. 기존 행은 어느 방향으로도 바뀌지 않는다.

```sql
ALTER TABLE "ax_agent_telemetry_collectors" ALTER COLUMN "interval_seconds" SET DEFAULT 21600;
```

## 가드 단위 테스트

```sh
pnpm --filter @gpters/db test:ax-child-guard
```
