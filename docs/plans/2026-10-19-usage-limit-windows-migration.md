# 0045 — 주간 한도 회차별 최댓값 (EDU-11519)

`0045_ax_usage_limit_windows.sql`은 `ax_usage_limit_windows` 테이블(기본 키 `user_id, client, resets_at`)과
`resets_at` 인덱스를 새로 만든다. 기존 행은 바꾸지 않는다.

## 왜

AX 「클라이언트 › 구독 갱신」 패널과 뽀밋이 DM(`GET /api/ax/subscription-sync`)은 결제일 전에
"이번 결제 주기에 주간 한도가 초기화되기 전 마지막 사용률"을 회차마다 모아 평균한다.
`ax_client_usage`는 (사용자, 클라이언트, UTC 하루) 행을 덮어쓰므로, Claude 표시줄 자동 보고(5분~1시간 간격)처럼
같은 날 초기화 뒤 다시 보고하면 **초기화 직전 값이 사라진다.** `report_usage`가 보고를 받을 때마다
회차 최댓값만 이 테이블에 올려 둔다. 서버가 받은 시각이 초기화 시각 이후인 보고는 넣지 않는다.

## 순서 — 어느 쪽이 먼저여도 안전하다

- 옛 코드는 이 테이블을 모른다 → 마이그레이션을 먼저 적용해도 안전하다.
- 새 코드는 테이블이 없으면 회차 기록만 건너뛰고(`report_usage`는 성공) 패널은 하루 단위 행만으로 계산한다.
- 다만 테이블이 생기기 전까지는 같은 날 초기화된 회차를 놓치므로 **배포 직후 적용**한다.

## 가드

`packages/db/src/migration/usage-limit-windows-guard.ts`가 적용 전후를 검증한다.

적용 전: 프로젝트·브랜치 신원(child는 운영 거부, production은 운영과 다른 recovery 필수),
이력 정확히 34건·최신 0044(`1791800000000`), 테이블 없음.
**0044가 운영에 아직 없으면 여기서 막힌다** — 0044 문서(`2026-10-12-agent-credential-org-edit-migration.md`)를 먼저 따른다.

적용 후: 이력 35건·최신 0045(`1792400000000`), 테이블·기본 키·인덱스 존재, `ax_client_usage` 행 수가 줄지 않음.
운영 수집은 적용 중에도 들어오므로 새 테이블 행 수와 사용량 행 증가는 실패 조건이 아니다(요약 줄에 기록만 한다).

```sh
pnpm --filter @gpters/db test:ax-child-guard
```

## 적용

### 자식 브랜치에서 먼저

```sh
pnpm --filter @gpters/db db:migrate:usage-limit-windows-child -- \
  --env-file <자식 브랜치 .env> \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --expected-branch-id <자식 브랜치 ID>
```

읽기 전용 preflight 결과를 확인한 뒤 같은 명령에 `--apply`를 덧붙인다.

자식 브랜치에서는 upsert 식도 한 번 실행해 본다(단위 테스트는 SQL 을 목으로 바꿔 식 자체를 못 본다).
`report_usage` 가 쓰는 것과 같은 식으로 같은 회차에 90 → 50 → 90 을 넣고 `max_used_percent = 90`,
`last_reported_at` 이 세 번째 시각, `last_seen_at` 이 세 번째 시각(50 을 받은 두 번째보다 늦음)인지 본다. 이 식은 `packages/lib/src/mcp/handlers.ts` 의 `recordLimitWindows` 에 있다.

### 운영 (하영 승인 뒤)

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다.

```sh
pnpm --filter @gpters/db db:migrate:usage-limit-windows-production -- \
  --env-file ../../.env.local \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --recovery-branch-id <새 복구 브랜치 ID>
```

첫 실행은 읽기 전용이다. `table=absent`·`ax_client_usage` 행 수를 확인한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-0045
```

## 토큰 범위

`GET /api/ax/subscription-sync` 는 구독 동기화(POST)와 같은 `AX_SUBSCRIPTION_SYNC_TOKEN` 을 쓴다.
이 토큰이 새면 쓰기(plan·apply)뿐 아니라 팀원별 구독·주간 사용률 읽기도 열린다. 원문은 뽀밋이 호스트에만 둔다.

## 되돌리기

새 코드는 테이블이 없어도 동작하므로 코드를 되돌리지 않아도 된다.

```sql
DROP TABLE ax_usage_limit_windows;
```

그리고 `drizzle.__drizzle_migrations`에서 `created_at = 1792400000000` 행을 지운다.
