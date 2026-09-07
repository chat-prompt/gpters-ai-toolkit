# AX 0035 카탈로그 위생 스냅숏 마이그레이션

`0035_ax_catalog_health_snapshots.sql`은 **새 테이블 하나를 만든다.** 기존 테이블을 건드리지 않는다.

## 왜 저장해야 하나

중복 패널은 스냅숏이라 "지금 묶음 8개"만 말한다. 정리가 먹히는지, 새로 쌓이고 있는지는 추세로만 알 수 있는데
**카탈로그는 과거 상태를 보존하지 않는다** — 스킬이 지워지면 흔적이 없고 본문이 바뀌면 예전 유사도를
다시 잴 수 없다. 소급 계산이 불가능하므로 매일 찍어 두는 수밖에 없다.

`(snapshot_date, item_type)` 복합 기본키라 같은 날 재실행은 덮어쓰기로 끝난다. 크론 재시도가 안전하다.

## 담기는 것 (2026-09-07 기준 예상값)

| 컬럼 | 값 |
| -- | -- |
| `total_items` | 489 |
| `never_loaded` | 306 |
| `never_applied` | 388 |
| `single_user_applied` | 73 |
| `duplicate_groups` | 8 |
| `duplicate_items` | 20 |
| `near_identical_pairs` | 12 |

중복 계산은 중복 패널과 **같은 함수**(`findDuplicatePairs` · `groupDuplicates`)를 쓴다.
따로 구현하면 화면 숫자와 추세 숫자가 갈린다. 계산에 약 2.2초 걸린다.

## 마이그레이션 없이도 화면은 산다

`readCatalogHealthTrend`가 실패하면 빈 배열로 떨어지고, 패널은 "아직 스냅숏이 없습니다"를 적는다.
**0을 그리지 않는다** — 비어 있는 것은 0건이 아니라 관측 이전이다.
따라서 마이그레이션 적용 전에 배포해도 안전하다.

## 가드

`packages/db/src/migration/catalog-health-snapshot-guard.ts`가 적용 전후를 검증한다.

적용 전 요구 조건:

- 마이그레이션 정확히 24건, 마지막이 0034(`1788414275714`)
- `ax_catalog_health_snapshots`가 아직 없음
- child 모드는 운영 브랜치를 거부하고, production 모드는 운영과 다른 recovery 브랜치를 요구

적용 후 요구 조건:

- 마이그레이션 25건, 마지막이 0035(`1788742000000`)
- 테이블이 존재
- `catalog_items` 행 수가 적용 전과 동일 (새 테이블만 만들어야 한다)

## Neon 자식 브랜치

```sh
pnpm --filter @gpters/db db:migrate:catalog-snapshot-child -- \
  --env-file ../../apps/web/.env.ax-child \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID"
```

읽기 전용 preflight 결과를 확인한 뒤 같은 명령에 `--apply`를 덧붙인다.

## 운영

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다
(0031~0034와 같은 방식. API 키가 없어 브라우저로 만든다).

```sh
pnpm --filter @gpters/db db:migrate:catalog-snapshot-production -- \
  --env-file ../../apps/web/.env.production.local \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID" \
  --recovery-branch-id "$AX_NEON_RECOVERY_BRANCH_ID"
```

읽기 전용 결과를 검토한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-ax-0035
```

## 되돌리기

새 테이블뿐이라 되돌리기도 한 문장이다. 그 사이 쌓인 스냅숏은 사라지고, 추세는 다시 처음부터 쌓인다.

```sql
DROP TABLE "ax_catalog_health_snapshots";
```

## 가드 단위 테스트

```sh
pnpm --filter @gpters/db test:ax-child-guard
```
