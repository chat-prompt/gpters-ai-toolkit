# 0044 — 에이전트 자격증명 조직 범위 수정 옵션 (DEV-4618)

`0044_agent_credential_org_edit.sql`은 `aitk_agent_credentials`에
`allow_org_edit boolean NOT NULL DEFAULT false` 컬럼 하나를 더한다. 행은 바꾸지 않는다.

## 왜

에이전트(뽀짝이 등)는 `allowDeploy`를 켜도 **토큰 주인이 작성한** 같은 조직 스킬만 고칠 수 있었다.
사람은 같은 조직 스킬을 모두 고칠 수 있다(#185). `allow_org_edit = true`인 자격증명은 사람 구성원과 같은 범위,
즉 토큰 조직의 항목을 작성자와 무관하게 수정(`deploy_skill`·`add_files`·`remove_files`)할 수 있다.
삭제·소유자 이전·다른 조직 항목·조직 없는 항목은 계속 막고, 에이전트가 수정하면 Slack 배포 알림에
에이전트와 원래 작성자를 표시한다.

## 순서 — 마이그레이션 먼저, 코드 배포는 그다음

새 코드는 에이전트를 인증할 때 `allow_org_edit`을 읽는다. 컬럼 없이 코드가 먼저 배포되면 **에이전트 인증이 전부 실패**한다.
옛 코드는 이 컬럼을 모르므로 마이그레이션을 먼저 적용해도 안전하다.

1. 이 브랜치에서 0044를 운영에 적용한다(아래).
2. PR을 머지한다(웹 배포 + aitk 0.7.24 npm 발행).
3. 토큰 주인이 `aitk agent authorize --agent <id> --output <파일> --allow-deploy --allow-org-edit`로 재발급하고
   에이전트 머신에 다시 import한다. 재발급하면 토큰이 회전한다.

## 운영 데이터 (2026-10-12, 읽기 전용 트랜잭션 SELECT)

| 항목 | 값 |
| -- | -- |
| Neon 프로젝트 / 브랜치 | `floral-wave-70284131` / `br-muddy-sea-a1znovvl` |
| Drizzle 이력 | 33건, 최신 `1790036000000`(0043) |
| `aitk_agent_credentials` | 1행(`bbojjak`, allow_deploy false), `allow_org_edit` 컬럼 없음 |

## 가드

`packages/db/src/migration/agent-credential-org-edit-guard.ts`가 적용 전후를 검증한다.

적용 전: 프로젝트·브랜치 신원(child는 운영 거부, production은 운영과 다른 recovery 필수),
이력 정확히 33건·최신 0043, 컬럼 없음.

적용 후: 이력 34건·최신 0044(`1791800000000`), 컬럼이 NOT NULL·DEFAULT false, 켜진 행 0,
자격증명 행 수 그대로.

```sh
pnpm --filter @gpters/db test:ax-child-guard
```

## 적용

### 자식 브랜치에서 먼저

```sh
pnpm --filter @gpters/db db:migrate:agent-org-edit-child -- \
  --env-file <자식 브랜치 .env> \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --expected-branch-id <자식 브랜치 ID>
```

읽기 전용 preflight 결과를 확인한 뒤 같은 명령에 `--apply`를 덧붙인다.

### 운영 (하영 승인 뒤)

복구 브랜치는 Neon 콘솔의 New Branch에서 부모 `production`, Auto-delete `After 1 day`로 만든다.

```sh
pnpm --filter @gpters/db db:migrate:agent-org-edit-production -- \
  --env-file ../../.env.local \
  --expected-project-id floral-wave-70284131 \
  --production-branch-id br-muddy-sea-a1znovvl \
  --recovery-branch-id <새 복구 브랜치 ID>
```

첫 실행은 읽기 전용이다. `column=absent`·`credentials`를 확인한 뒤 다음을 덧붙인다.

```sh
  --apply --confirm-production-migration apply-0044
```

## 되돌리기

코드를 먼저 되돌린 뒤(새 코드는 컬럼을 읽는다):

```sql
ALTER TABLE aitk_agent_credentials DROP COLUMN allow_org_edit;
```

그리고 `drizzle.__drizzle_migrations`에서 `created_at = 1791800000000` 행을 지운다.
