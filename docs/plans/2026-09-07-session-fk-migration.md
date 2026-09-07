# AX 0037 — 세션이 지워져도 스킬 이벤트는 남긴다

`skill_events.session_id`와 `ax_skill_execution_attempts.session_id`의 외래키를
`on delete cascade` → `on delete set null`로 바꾼다.

## 왜

`finalize-sessions` 크론이 매일 03:00 UTC에 `mcp_sessions`에서 90일 지난 행을 지운다.
그 자체는 의도한 보관 정책이다. 문제는 **두 자식 테이블이 cascade라 사건까지 같이 지워진 것**이다.

"누가 언제 무슨 스킬을 열었나"는 세션보다 오래 살아야 한다 — 요약 화면의 365일 잔디와
"한 번도 로드 안 됨 / 적용 0건" 판정이 전부 `skill_events`에서 나온다.

### 손실은 실제로 일어났다 (2026-09-07 실측)

| 테이블 | 캐스케이드 | 가장 오래된 행 |
| -- | -- | -- |
| `mcp_audit_logs` | 없음 | 2025-12-29 |
| `mcp_sessions` | (부모) | 2026-06-08 |
| `skill_events` | **있음** | 2026-06-08 |

`skill_events`는 마이그레이션 0017로 **2026-03-11**에 생겼는데 살아 있는 가장 오래된 행이 6월 8일이다.
90일 컷오프와 정확히 겹친다. 3월~6월 초 이벤트는 세션과 함께 사라졌다.

대조군인 `mcp_audit_logs`는 캐스케이드가 없어 3·4·5월 것이 각각 8천~1만 건씩 그대로 있다.

### 지금의 일일 손실은 작다

세션 없는 CLI 보고(0032, DEV-4259)가 8월부터 들어와서, 13,005건 중 세션이 붙은 건 442건뿐이다.
2026-09-07 기준 오늘 밤 지워질 세션은 97건(딱 하루치)이고 딸려 갈 이벤트는 10건이다.
**서두를 일은 아니지만 매일 조금씩 계속 새는 구멍이다.**

## 왜 `set null`인가

- `session_id`는 이미 nullable이다 (0032가 세션 없는 CLI 보고를 받으려고 열었다)
- 지표 코드가 세션 없는 행을 이미 다룬다 — `coalesce(journey_id, session_id)`로 묶는다
  (`activity-grass.ts`, `skills.ts`)
- 세션이 사라진 행은 **삭제되는 대신 "연결 불가"가 된다.** 미관측과 0을 구분하는 원칙과 맞는다

세션을 아예 안 지우는 선택지도 있었지만, `mcp_sessions`에는 클라이언트·IP 해시가 들어 있어
90일 보관 자체는 유지하는 편이 낫다.

## 제약조건 이름을 가정하지 않는다

운영에 이름이 섞여 있다. drizzle이 붙인 것과 Postgres 기본 이름이 공존한다.

```
skill_events                  skill_events_session_id_mcp_sessions_session_id_fk   CASCADE
ax_skill_execution_attempts   ax_skill_execution_attempts_session_id_fkey          CASCADE
```

`DROP CONSTRAINT IF EXISTS <틀린 이름>`은 **조용히 넘어간다.** 그러면 옛 CASCADE가 남은 채
새 제약이 하나 더 붙어서, 겉보기엔 성공인데 삭제는 계속 연쇄된다.

그래서 0037은 `pg_constraint`에서 `mcp_sessions`를 참조하는 FK를 찾아 지우고 다시 만든다.
가드도 삭제 규칙만이 아니라 **테이블당 제약 개수가 정확히 1인지**까지 센다.

## 적용

### 자식 브랜치에서 먼저

```sh
pnpm --filter @gpters/db db:migrate:session-fk-child -- \
  --env-file <자식 브랜치 .env> \
  --expected-project-id "$AX_NEON_PROJECT_ID" \
  --production-branch-id "$AX_NEON_PRODUCTION_BRANCH_ID" \
  --expected-branch-id "$AX_NEON_CHILD_BRANCH_ID"
```

### 운영

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다
(0031~0036과 같은 방식. API 키가 없어 브라우저로 만든다).

```sh
pnpm --filter @gpters/db db:migrate:session-fk-production -- \
  --env-file ../../apps/web/.env.local \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --recovery-branch-id <새 복구 브랜치 ID>
```

읽기 전용 결과를 검토한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-ax-0037
```

> `--env-file`은 `.env.production.local`이 아니라 `../../apps/web/.env.local`이다.
> 레포에 전자가 없고 후자의 `DATABASE_URL`이 운영을 가리킨다 (0036 적용 때 확인).

## 검증

러너가 적용 전후로 다음을 확인하고, 하나라도 어긋나면 멈춘다.

- 프로젝트·브랜치 신원, 운영은 별도 복구 브랜치 필수
- 적용 전 마이그레이션 26개(0036까지), 두 FK가 각각 1개씩 `CASCADE`
- 적용 후 27개, 두 FK가 각각 1개씩 `SET NULL`
- **`skill_events`·`ax_skill_execution_attempts` 행 수가 그대로** — 0037은 규칙만 바꾼다

## 되돌리기

```sql
ALTER TABLE skill_events DROP CONSTRAINT skill_events_session_id_mcp_sessions_session_id_fk;
ALTER TABLE skill_events ADD CONSTRAINT skill_events_session_id_mcp_sessions_session_id_fk
  FOREIGN KEY (session_id) REFERENCES public.mcp_sessions(session_id) ON DELETE cascade;
-- ax_skill_execution_attempts도 같은 형태
```

되돌리면 다시 새기 시작한다. 되돌릴 이유가 생기기 어렵다.

## 가드 단위 테스트

```sh
pnpm --filter @gpters/db test:ax-child-guard
```
