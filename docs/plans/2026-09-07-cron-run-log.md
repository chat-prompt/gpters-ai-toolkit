# 크론 실행 기록과 감시 (AX 0038)

크론이 돌았는지 · 성공했는지 · 무엇을 했는지를 `cron_runs`에 실행마다 한 줄 남기고,
매일 05:00 UTC에 감시해 문제만 Slack으로 알린다.

## 왜

2026-09-07 전수 점검에서 크론 10개 중 정상이 3개뿐이었다. **셋의 실패 모양이 다 달랐다.**

| 잡 | 실패 모양 | 발견까지 |
| -- | -- | -- |
| 커뮤니티 스킬 임포트 | 업스트림 구조 변경으로 0건을 가져오며 **성공으로 끝남** | 6개월 |
| `evo-promote` | SQL 오류로 예외 | 20주 |
| `catalog-health-snapshot` | 라우트가 앱 밖이라 404 — 아예 안 불림 | 즉시(운 좋게) |

성공 여부만 남겨서는 첫 번째를 못 잡는다. 그래서 **산출량(`stats`)까지** 남긴다.
실행 기록이 남던 크론은 evo 계열(`evo_run_logs`)뿐이었고, 나머지는 DB 부산물로 역추적해야 했다.

## 구조

```
runCronJob(jobName, handler)          라우트가 감싸는 실행 단위. 기록 + 실패 시 즉시 Slack
  └ cron_runs                          실행마다 한 줄 (status · stats · error · duration)

CRON_EXPECTATIONS                      잡별 기대 주기와 "0을 문제로 볼지"
  └ checkCronHealth()                  기록과 기대치를 대조
      └ /api/cron/cron-health          매일 05:00 UTC. 문제가 있을 때만 알린다
```

### 실패는 두 층에서 잡는다

- **예외** — `runCronJob`이 그 자리에서 Slack으로 알린다. `evo-promote`가 이 층에서 잡혔을 것이다
- **침묵과 산출 0** — 알림조차 못 보내는 실패다. 감시가 하루 뒤에 잡는다.
  404로 안 불린 잡은 기록이 없고, 성공하는데 0만 내는 잡은 `stats`로만 보인다

### 0을 언제 문제로 보는가

잡마다 다르다. `redact-skill-text`는 지울 게 없으면 0이 정상이고, `catalog-health-snapshot`은
카탈로그가 비어 있을 리 없으니 0이면 잘못된 것이다. `outputKeys`가 빈 잡은 산출량을 감시하지 않는다.

### 문제가 없으면 아무것도 보내지 않는다

매일 "이상 없음"을 보내면 그 채널을 아무도 안 읽게 되고, 진짜 알림이 같이 묻힌다.
evo가 매일 "생성 0건"을 보내며 정확히 그렇게 됐다.

### 기록 실패가 잡을 실패시키지 않는다

실행 기록은 감시 장치지 잡의 목적이 아니다. `cron_runs` 삽입이 실패했다고 스냅숏이나 세션 마감을
실패로 만들면 감시하려다 본체를 망가뜨린다. 그래서 기록·알림 실패는 삼킨다.

### 감시는 자기 자신을 못 본다

`cron-health`가 죽으면 `cron_runs`에 기록이 끊긴다. 이건 대시보드에서 사람이 보는 수밖에 없다.
그래서 `CRON_EXPECTATIONS`에는 자기 자신을 넣지 않았다.

## 적용

### 자식 브랜치에서 먼저

```sh
pnpm --filter @gpters/db db:migrate:cron-runs-child -- \
  --env-file <자식 브랜치 .env> \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID"
```

### 운영

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다.

```sh
pnpm --filter @gpters/db db:migrate:cron-runs-production -- \
  --env-file ../../apps/web/.env.local \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --recovery-branch-id <새 복구 브랜치 ID>
```

읽기 전용 결과를 검토한 뒤 `--apply --confirm-production-migration apply-ax-0038`을 덧붙인다.

## 검증

러너가 적용 전후로 확인하고 하나라도 어긋나면 멈춘다.

- 프로젝트·브랜치 신원, 운영은 별도 복구 브랜치 필수
- 적용 전 마이그레이션 27개(0037까지), `cron_runs` 없음
- 적용 후 28개, `cron_runs`와 `cron_run_status` enum 둘 다 있음
- `skill_events` 행 수가 그대로 — 0038은 새 테이블만 만든다

## 되돌리기

```sql
DROP TABLE "cron_runs";
DROP TYPE "cron_run_status";
```

라우트 코드는 기록 실패를 삼키므로 테이블이 없어도 크론은 계속 돈다.

## 확인

```sh
pnpm --filter @gpters/db test:ax-child-guard          # 가드
pnpm --filter @gpters/web exec vitest run tests/unit/cron-health.test.ts tests/unit/cron-routes.test.ts
```

`cron-routes.test.ts`가 **`vercel.json`과 감시 레지스트리가 어긋나면 빨개진다** —
크론을 추가하고 감시에 안 넣거나, 감시에만 남기고 크론을 지우는 경우 둘 다 잡는다.
