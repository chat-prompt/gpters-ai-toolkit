# AX 0043 — 구독 키 유니크 제약 (DEV-4491)

`0043_ax_subscriptions_key_unique.sql`은 `ax_subscriptions`에
`(vendor, plan, owner_name, renewal_day)` **UNIQUE NULLS NOT DISTINCT** 제약 `ax_subscriptions_key_uniq`
하나를 더한다. 행은 바꾸지 않는다.

## 왜

구독 동기화 API(`POST /api/ax/subscription-sync`, DEV-4486)는 plan 해시를 **트랜잭션 밖에서** 확인한 뒤
`db.batch`(Neon HTTP, 한 트랜잭션)로 update·insert·delete 한다. 같은 해시를 든 apply 둘이 거의 동시에 들어오면
둘 다 해시 확인을 통과해 같은 구독이 두 줄 들어간다. 지금 호출자는 뽀밋이 하나고 반영에 원자적 점유를 걸어
두 번 부르지 않지만, 서버 쪽 방어선은 없었다(fable·astra 교차 검증 9/21 지적).

## 충돌하면 어떻게 되나

- 늦게 커밋하는 쪽 batch 의 insert 가 제약에 걸려 **batch 전체가 롤백된다** — update·delete 도 반쯤 남지 않는다
- API 는 이 경우만(SQLSTATE `23505` + 제약 이름 `ax_subscriptions_key_uniq`) **409** `status: "conflict"`,
  `"...nothing was applied. Run plan again"`으로 돌려준다. 해시 불일치 409 와 같은 모양이라 호출자는 같은 처리(다시 plan)를 하면 된다
- 다른 제약 위반·DB 오류는 지금처럼 500 이다(충돌로 숨기지 않는다)
- 로컬 postgres-js(batch 없음 → transaction 경로)도 같은 판정을 쓴다

## NULL 처리 — NULLS NOT DISTINCT

`owner_name`(팀 공용 구독이면 NULL)과 `renewal_day`는 nullable 이다. Postgres 기본 유니크는 NULL 끼리 서로 다르다고 보므로
팀 공용 구독이 같은 키로 여러 줄 들어갈 수 있다. 코드의 키 함수 `subscriptionKey`는 NULL 을 한 값(`''`)으로 묶으므로
DB 도 **`NULLS NOT DISTINCT`**(PG 15+)로 같은 값으로 본다.

- 운영 PG 버전: **17.11** (2026-09-22 읽기 전용 확인). 로컬 격리 환경은 `pgvector/pgvector:pg17`
- drizzle 의 `uniqueIndex()`는 NULLS NOT DISTINCT 를 표현하지 못해 스키마는 `unique(...).nullsNotDistinct()` **제약**으로 둔다
  (제약이 같은 이름의 유니크 인덱스를 만든다)
- 남는 차이: 코드 키는 `owner_name` 의 NULL 과 `''`를 같게 보지만 DB 는 다르게 본다. 로스터 파서는 이름이 빈 행을 거절하고
  운영에 `''`는 0행이라 실제로 갈리지 않는다
- 가드는 PG 15 미만이면 적용을 막는다

## 운영 데이터 (2026-09-22, 읽기 전용 트랜잭션 SELECT)

| 항목 | 값 |
| -- | -- |
| Neon 프로젝트 / 브랜치 | `floral-wave-70284131` / `br-muddy-sea-a1znovvl` |
| PostgreSQL | 17.11 |
| Drizzle 이력 | 32건, 최신 `1789020000000`(0042) |
| `ax_subscriptions` | 26행, `owner_name` NULL 0, `renewal_day` NULL 0, `owner_name = ''` 0 |
| 중복 키 묶음 | 0 (NULL 을 같은 값으로 묶은 기준, `coalesce` 기준 모두 0) |

## 가드

`packages/db/src/migration/ax-subscriptions-key-guard.ts`가 적용 전후를 검증한다.

적용 전: 프로젝트·브랜치 신원(child 는 운영 거부, production 은 운영과 다른 recovery 필수), PG 15+,
이력 정확히 32건·최신 0042, 제약 없음, **중복 키 묶음 0**.

적용 후: 이력 33건·최신 0043(`1790036000000`), 제약 존재 + `indnullsnotdistinct = true`, `ax_subscriptions` 행 수 그대로.

```sh
pnpm --filter @gpters/db test:ax-child-guard
```

## 적용

### 자식 브랜치에서 먼저

```sh
pnpm --filter @gpters/db db:migrate:subscription-key-child -- \
  --env-file <자식 브랜치 .env> \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --expected-branch-id <자식 브랜치 ID>
```

읽기 전용 preflight 결과를 확인한 뒤 같은 명령에 `--apply`를 덧붙인다.

### 운영 (하영 승인 뒤)

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다
(0031~0038과 같은 방식).

```sh
pnpm --filter @gpters/db db:migrate:subscription-key-production -- \
  --env-file ../../apps/web/.env.local \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --recovery-branch-id <새 복구 브랜치 ID>
```

첫 실행은 읽기 전용이다. `subscriptions`·`duplicateKeyGroups=0`을 확인한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-ax-0043
```

적용 전에 새 API 코드가 배포돼 있어도, 제약 없이 배포돼 있어도 안전하다. 제약이 없으면 409 경로가 안 탈 뿐 지금과 같다.

## 되돌리기

```sql
ALTER TABLE ax_subscriptions DROP CONSTRAINT ax_subscriptions_key_uniq;
```

되돌리면 동시 apply 중복 방어만 사라진다.
