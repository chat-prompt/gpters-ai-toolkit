# AX 0035 실행 보고 모델 컬럼 마이그레이션

`0035_ax_execution_model.sql`은 `ax_skill_execution_attempts`에 nullable `model` 컬럼 하나를 더한다.
**기존 행은 바꾸지 않고, 어떤 값도 채우지 않는다.**

## 왜 여기에 여는가

"어느 모델이 스킬을 더 잘 쓰는가"를 물으려면 실행 시도마다 모델이 붙어 있어야 한다. 지금 그 자리가 없다.

붙일 수 있는 곳이 두 군데였다:

| 후보 | 성질 | 판단 |
| -- | -- | -- |
| `ax_agent_telemetry_batches.models` | 수집기가 집계한 기간별 모델 분포 | **쓰지 않는다.** 시도 하나를 어느 모델이 돌렸는지는 여기서 알 수 없고, 겹치는 시간대로 역추정하면 추정이 된다 |
| 실행 보고 계약 | 보고자가 자기 모델을 직접 밝힘 | **채택.** 실측이고, 안 밝히면 NULL로 남아 미보고와 구분된다 |

`mcp_sessions`에는 `clientType`/`clientName`/`clientVersion`만 있고 모델은 없다.

## 계약

`report_skill_execution_started`와 `report_skill_execution` 모두 선택 필드 `model`을 받는다.

- **enum이 아니다.** 새 모델이 나올 때마다 보고가 조용히 거절되면 미보고와 구분되지 않아
  실측이 아니라 누락이 된다. 형태(소문자·숫자·`. _ : / -`, 64자 이내)만 검사하고 값은 그대로 받는다.
- 소문자로만 정규화한다. `anthropic/claude-sonnet-4-5-20250929`처럼 제공자 접두사가 붙은 값도 그대로 남는다.
- **모르면 생략한다.** 스킬 문서에 "확실히 알 때만 보내고 추측하지 않는다"를 명시했다. 런타임 이름
  (`claude-code`)을 모델 자리에 대신 넣지 않는다 — 그건 이미 `agent`에 있다.
- 완료 보고가 `model`을 생략해도 시작에서 기록한 값을 지우지 않는다.

## 화면에는 아직 올리지 않는다

30일 검증 성공 시도가 4건이다. 표본이 이 수준에서 모델별 비교를 화면에 올리면 잡음을 신호로 읽게 된다.
컬럼과 계약만 먼저 열고, 보고가 쌓인 뒤에 패널을 판단한다.

## 가드

`packages/db/src/migration/ax-execution-model-guard.ts`가 적용 전후를 검증한다.
`drizzle`의 `migrate()`는 미적용 마이그레이션을 모두 적용하므로 기준선을 preflight에서 막는다.

적용 전 요구 조건:

- 마이그레이션 정확히 24건, 마지막이 0034(`1788414275714`)
- `ax_skill_execution_attempts` 존재 (0029 적용됨)
- `model` 컬럼이 아직 없음
- child 모드는 운영 브랜치를 거부하고, production 모드는 운영과 다른 recovery 브랜치를 요구

적용 후 요구 조건:

- 마이그레이션 25건, 마지막이 0035(`1788555600000`)
- `model` 컬럼이 존재하고 **nullable** (NOT NULL이면 미보고를 담을 수 없다)
- 시도 행 수가 적용 전과 동일 (컬럼만 늘어야 한다)

## Neon 자식 브랜치

```sh
pnpm --filter @gpters/db db:migrate:execution-model-child -- \
  --env-file ../../apps/web/.env.ax-child \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID"
```

읽기 전용 preflight 결과를 확인한 뒤 같은 명령에 `--apply`를 덧붙인다.

## 운영

운영은 직전에 현재 운영 데이터·스키마로 만든 recovery 브랜치와 두 번째 확인 문자열을 요구한다.
복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다
(0031~0034와 같은 방식이다. API 키가 없어 브라우저로 만든다).

```sh
pnpm --filter @gpters/db db:migrate:execution-model-production -- \
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

nullable 컬럼 하나만 늘어나므로 되돌리기도 한 문장이다. 다만 그 사이 들어온 모델 보고는 사라진다.

```sql
ALTER TABLE "ax_skill_execution_attempts" DROP COLUMN "model";
```

## 가드 단위 테스트

```sh
pnpm --filter @gpters/db test:ax-child-guard
```
