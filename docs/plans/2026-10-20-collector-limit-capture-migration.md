# 0046 — 수집기 점검 행에 Claude 한도 연결 상태 (EDU-11519)

`0046_ax_collector_limit_capture.sql`은 `ax_usage_collector_state`에 `limit_capture jsonb`(nullable) 하나를 더한다.
기존 행은 null로 남는다.

## 왜

Claude 주간 한도는 상태 표시줄이 Claude Code에서 받은 값으로만 들어온다. 최신 aitk인데도 한도가 비는 사람이 있었고,
원인(자동 연결 건너뜀·여러 aitk·표시줄을 실행하지 않는 환경)은 각자 머신의 `~/.cache/gpters-aitk/usage-setup.log`에만 남았다.
aitk 0.7.25부터 `report_usage`가 연결 상태(`statusline`·마지막 `setup --auto` 결과 코드·한도 수신 시각)를 싣고,
서버가 이 컬럼에 저장해 AX 「클라이언트 › 수집 참여 상태」의 Claude 한도 열로 보여준다.
고정 코드와 시각만 받는다(`packages/lib/src/features/ax/usage-report.ts`의 `parseLimitCapture`). 옛 aitk 보고는 이전 값을 지우지 않는다.

알려진 한계: 사용자당 한 행이라 머신이 여러 대면 마지막 보고 머신 기준이다. Codex 플러그인 훅의 보고는 Codex 세션 env 에서
`CLAUDE_CONFIG_DIR`을 읽으므로, Claude 에만 그 변수를 쓰는 사람은 Codex 쪽 보고가 기본 경로 상태를 보낼 수 있다.

## 순서 — 마이그레이션이 먼저다

- 옛 코드는 이 컬럼을 모른다 → 먼저 적용해도 안전하다.
- **새 코드는 컬럼이 없으면 깨진다.** drizzle의 insert·select가 스키마의 모든 컬럼을 나열하므로
  `report_usage`의 점검 행 upsert가 실패하고, 참여 상태 조회는 빈 결과로 떨어진다. 반드시 적용 뒤에 머지(=배포)한다.
- aitk 0.7.25는 머지와 함께 npm에 배포된다. 옛 서버는 모르는 인자를 무시하므로 aitk 쪽 순서는 상관없다.

## 가드

`packages/db/src/migration/collector-limit-capture-guard.ts`가 적용 전후를 검증한다.

적용 전: 프로젝트·브랜치 신원(child는 운영 거부, production은 운영과 다른 recovery 필수),
이력 정확히 35건·최신 0045(`1792400000000`), 컬럼 없음.

적용 후: 이력 36건·최신 0046(`1793000000000`), 컬럼이 `jsonb`, `ax_usage_collector_state` 행 수가 줄지 않음
(운영 보고로 늘어나는 건 정상).

```sh
pnpm --filter @gpters/db test:ax-child-guard
```

## 적용 (하영 승인 뒤)

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다.

```sh
pnpm --filter @gpters/db db:migrate:collector-limit-capture-production -- \
  --env-file ../../.env.local \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --recovery-branch-id <새 복구 브랜치 ID>
```

첫 실행은 읽기 전용이다. `limit_capture=absent`·점검 행 수를 확인한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-0046
```

자식 브랜치에서 먼저 해 보려면 `db:migrate:collector-limit-capture-child`에 `--expected-branch-id <자식 브랜치 ID>`를 준다.

## 확인

aitk 0.7.25가 퍼진 다음 날 `select count(*) from ax_usage_collector_state where limit_capture is not null`이 늘었는지,
대시보드 Claude 한도 열에 "상태 미보고" 대신 실제 상태가 나오는지 본다.

## 되돌리기

**코드를 먼저 되돌려 배포한 뒤** 컬럼을 지운다(새 코드는 컬럼이 없으면 점검 행 upsert 가 깨진다).

```sql
ALTER TABLE ax_usage_collector_state DROP COLUMN limit_capture;
```

그리고 `drizzle.__drizzle_migrations`에서 `created_at = 1793000000000` 행을 지운다.
