# AGENTS.md

이 저장소에서 일하는 코딩 에이전트(Claude Code·Codex 등) 공통 지침의 정본이다. Claude Code 는 `CLAUDE.md` 의 `@AGENTS.md` 로 같은 내용을 읽는다. 규칙을 새로 정하거나 고칠 때는 이 파일에 쓴다.

파일 구조·스크립트처럼 레포를 보면 알 수 있는 것은 적지 않는다. 여기에는 보고도 틀리기 쉬운 것(함정)과 팀 규칙만 둔다.

## Project Overview

GPTers AI Toolkit — 코딩 에이전트용 스킬·에이전트·커맨드·훅·가이드를 검색하고 공유하는 플랫폼.
MCP 서버와 `aitk` CLI로 로컬 설치 없이 필요한 순간에 스킬을 불러온다.
사내 AX(AI Transformation) 대시보드도 같은 앱에 들어 있다.

## 구조의 함정

- Turbo + pnpm 모노레포다. **루트에 `app/`·`components/`·`lib/`·`plugins/`는 없다** — 웹은 `apps/web`, 공유 로직은 `packages/lib`, 스키마는 `packages/db`.
- `apps/web/lib/`는 대부분 `@gpters/lib` 재수출 shim이다. 로직을 고칠 곳은 `packages/lib/src/`다.
- 루트 스크립트는 전부 turbo 위임이다. 한 패키지만 돌릴 때는 `--filter`를 쓴다.
  - 단위 테스트 하나: `corepack pnpm --filter @gpters/web exec vitest run tests/unit/<file>`
  - web dev 서버: `corepack pnpm --filter @gpters/web exec dotenv -e ../../.env.local -- next dev -H 127.0.0.1 -p 3000`
- 페이지 경로는 전부 `app/[locale]/…`다 (next-intl, `ko` 기본 / `en`).
- 개별 스킬·에이전트 콘텐츠는 파일이 아니라 **DB(`catalog_items`)에 있다.** Claude Code 마켓플레이스는 루트 `.claude-plugin/marketplace.json` + `apps/claude-code-plugin/`, Codex·OpenCode 플러그인은 `apps/codex-plugin`·`apps/opencode-plugin`에서 npm으로 배포한다.
- `authors` 테이블은 없다 — 저자는 `catalog_items.author_id` → `users`다. 테이블 정본은 `packages/db/src/schema.ts`.
- 카탈로그 항목의 `files` 필드 타입(`script`/`reference`/`template`/`config`)은 `packages/lib/src/core/types.ts`, 파일명 추론은 `packages/lib/src/mcp/handlers.ts`의 `inferFileType`.

## 인증

- `apps/web/middleware.ts`가 모든 경로를 막고 `isPublicRoute()`에 나열된 경로만 통과시킨다. 새 공개 API는 여기에 추가해야 열린다.
- 로그인 허용은 **하드코딩된 단일 도메인이 아니다.** `apps/web/lib/core/auth-config.ts`의 `signIn` 콜백이
  `isAllowedAccountEmail()` → 이메일 도메인과 `organizations.allowedDomains`가 겹치는 활성 조직이
  하나라도 있어야 통과시킨다. 정지(`suspended`) 계정은 거부한다.
- NextAuth v5(beta) + Google OAuth와 별개로, 자체 OAuth 2.1 provider(`/oauth`, `/.well-known`)가 MCP 클라이언트용으로 있다.
- 환경 변수는 `.env.example` 참고. 함정 둘:
  - `INTERNAL_ORGANIZATION_DOMAIN`이 비어 있으면 AX 대시보드는 **전원 차단된다.**
  - `DEV_BYPASS_AUTH=true`는 `NODE_ENV=development`에서만 동작한다 (미들웨어·AX 양쪽 이중 게이트).

## MCP Server

- Endpoint `/api/mcp`. 도구 정의 정본은 `packages/lib/src/mcp/tools.ts`다.
- `search_plugins`, `list_plugins`, `get_plugins_by_category`, `suggest_improvement`는 **더 이상 없다**
  (옛 이름은 `mcp_audit_logs` 과거 행에만 남아 있다).
- 팀원 연결은 `docs/TEAM_ONBOARDING.md`, 배포는 `docs/DEPLOYMENT_GUIDE.md`.

## AX 대시보드

사내 AX 지표 화면(`/[locale]/ax`). 데이터 계층은 `packages/lib/src/features/ax/`, 화면은
`apps/web/components/ax/`다.

- **패널 레지스트리 구조**: `features/ax/registry.ts`의 `AX_PANELS` 배열 + 단일 라우트
  `app/api/ax/[panel]/route.ts`. 지표를 추가할 때 라우트를 새로 만들지 않는다.
- 최상위 탭은 `parentId` 없는 패널(`overview` / `skill-usage` / `client-usage` / `vercel-deployments`),
  나머지는 하위 탭이다. `hidden: true` 패널은 탭에 안 나온다 — `activity-grass`는 보이는 화면이 의존할 때만
  대시보드가 불러오고, `boot-probe`처럼 MCP 등 다른 독자용 패널은 대시보드가 불러오지 않는다.
- 기간은 7 / 30 / 90일만 허용하고 기본값은 7일이다.
- 접근 판정은 `features/ax/access.ts` — `INTERNAL_ORGANIZATION_DOMAIN` 구성원 전원 열람,
  개인 식별 데이터는 admin 전용.
- 패널 디자인 조각의 정본은 `apps/web/components/ax/panels/primitives.tsx`다. 새 패널은 여기서 시작한다.

**작업 전 반드시 읽을 것**: `docs/plans/2026-09-02-ax-dashboard-next-work-handoff.md` (정본 인수인계).
지표의 정확한 정의(로드 코호트 기반 전환율, 연결 가능 로드 분모), 집계 함정, 다음 작업 순서가 여기 있다.

**지표 원칙**: 추정하지 않고 실측만 보여준다. 표본이 작으면 비율 대신 `n/d · 참고`로 적는다
(`formatSampledRate`). 수집 누락과 실제 0건을 같은 표시로 쓰지 않는다.

## DB 마이그레이션

- 스키마 변경은 `packages/db/src/schema.ts` 수정 → `pnpm db:generate`.
- **운영 적용은 guarded runner로만 한다.** `packages/db/scripts/`에 마이그레이션별 runner가 있고,
  운영 적용에는 운영과 다른 Neon 복구 브랜치 ID를 요구한다. 절차는 `docs/plans/2026-08-25-ax-migration-runbook.md`.
- 복구 브랜치는 Neon 콘솔에서 직접 만든다 (레포·Vercel 어디에도 Neon API 키가 없다).
- 운영 배포·DB 변경·백필은 **사용자 승인 전에는 실행하지 않는다.**

## 테스트

- 기능 작업에는 관련 테스트를 함께 쓴다 — API는 `apps/web/tests/api/`, 유틸·라이브러리는 `apps/web/tests/unit/`·`packages/*/tests/` (Vitest), 주요 사용자 흐름은 `apps/web/tests/e2e/` (Playwright).
- `pnpm test`(`@gpters/web test`)는 기본적으로 `tests/unit`만 실행한다.
- **테스트 데이터 안전** — `tests/api`와 `tests/e2e`에는 카탈로그·태그·MCP 서버를 생성·수정·삭제하는 테스트가 있다.
  - 현재 개발 서버나 운영·공유 DB를 바라보는 서버에는 API/E2E 전체 테스트를 실행하지 않는다.
  - API 테스트는 격리된 일회용 DB와 그 DB를 바라보는 전용 서버를 준비하고,
    `TEST_API_URL`, `TEST_DATABASE_URL`, `CONFIRM_ISOLATED_API_TESTS=run-mutating-api-tests`를
    모두 명시한 경우에만 실행한다.
  - 실행 전후 DB 브랜치 ID와 `test-*` 잔여 레코드 수를 확인한다.

## 코드 문서화 (TSDoc)

파일 헤더와 exported 함수·컴포넌트·타입·Props 속성에 TSDoc을 다는 관례다. 주변 파일과 같은 밀도로 쓴다.
`'use client'` 파일은 디렉티브 **다음에** 파일 헤더를 둔다.

## Push 전 확인

```bash
pnpm lint && pnpm test && pnpm build
```

빌드나 테스트가 실패하면 Vercel 배포도 실패한다.

> `pnpm typecheck`는 이번 작업과 무관한 기존 타입 오류가 남아 있어 red다
> (테스트 matcher 타입, MCP response unknown, `packages/lib` 경로 별칭 등).
> 회귀 판단은 대상 테스트 + `pnpm build`로 한다.

## UI 변경 확인

모든 화면(AX 대시보드 포함)의 레이아웃·차트·범례·문구를 바꾸면 자동화 테스트만으로 완료 처리하지 않는다.

- 로컬 개발 서버에서 브라우저 또는 디자인 검수 도구로 데스크톱 화면을 직접 확인한다 — 범례 간격, 텍스트 줄바꿈, 막대 겹침, 밝은·어두운 테마의 대비, 가로 스크롤과 잘림.
- 운영 데이터를 읽는 로컬 화면에서는 조회만 수행하고, 운영·공유 DB를 변경하는 API/E2E 검증은 실행하지 않는다.
- 끝나면 사용자가 직접 볼 수 있게 변경이 반영된 로컬 개발 서버를 켜 둔다. 검수 완료만을 이유로 종료하지 않는다.
- 완료 응답에는 접속 URL, 확인할 메뉴·영역, 직접 해볼 동작을 함께 안내한다. 합성 데이터 미리보기와 실제 데이터 화면, 로컬 반영과 운영 배포를 명확히 구분한다.
- 기존 사용자 서버를 임의로 종료하거나 포트를 빼앗지 않는다. 다른 포트를 사용했다면 실제 주소를 알린다.

## 팀 스킬 활용

새 작업을 시작하기 전에 팀이 공유한 스킬이 있는지 확인한다. 기본 검색 경로는 `aitk` CLI다
(플러그인 훅은 검색 힌트를 넣지 않으므로 직접 검색한다).

```bash
aitk search '키워드' --limit 3 --context '작업 맥락'
aitk get '스킬ID'                                     # 관련도 0.40 이상이면 로드
aitk report-skip --query '검색어' --reason '사유'      # 미만이면 스킵 보고
aitk report-outcome --skill-id '스킬ID' --applied true --summary '결과'
```

MCP로 붙어 있으면 `semantic_search` / `get_plugin_content`가 같은 역할을 한다.
만든 스킬을 팀과 공유하려면 `deploy_skill`을 쓴다.

## Slack 에이전트 업무방

이 저장소의 작업을 Slack 에이전트 업무방에서 요청하거나 조율하기 전에
`docs/AGENT_SLACK_CHANNEL_RULES.md`를 반드시 읽고 따른다.

- 새 작업 요청은 새 원문과 새 스레드로 시작한다. 기존 문맥이 꼭 필요한 진행 중 작업의 직접 후속만 기존 스레드에 잇는다.
- 같은 에이전트·같은 주제라도 별도 작업이면 새 스레드를 만들고, 필요한 과거 맥락은 요약과 링크로 전달한다.
- 채널 원문은 대상 에이전트 멘션과 짧은 한 줄 제목만 사용한다.
- 배경·지시·검증·후속 대화·결과는 모두 해당 원문의 스레드에 쓴다.
- 처음 사용하는 방이거나 규칙이 불명확하면 최하영님(`<@U0BP4R0CUSD>`)을 먼저 호출한다.

## Agent telemetry rollout

에이전트 수집기를 신규 설치·업데이트·검증할 때는
`infra/agent-telemetry/PROTOCOL.md`를 먼저 읽는다.
공개 저장소에는 범용 코드와 익명 예시만 두고, 실제 소유자·호스트·경로·인증·운영 증거는
비공개로 관리한다. 설치 완료와 서버 적재 확인은 별도 상태로 보고한다.

## 핸드오프 문서 작성

- `docs/plans/`의 `-handoff`·`-runbook` 문서를 쓰거나 크게 고칠 때는 `handoff` 스킬을 따른다.
  커밋 전에 낮은 티어 에이전트 둘(claude sonnet · codex gpt-5.6-terra)에게 문서만 주고
  실제로 이어받게 해 본 뒤, 미리 봉인한 의도와 대조한다.
- 이 세션의 메모리에만 있는 사실은 다음 에이전트에게 없다. 문서에 적거나, 문서가 제시하는
  명령으로 다시 얻을 수 있게 한다.
- 문서 하단에 검증 블록을 남긴다. 검증자의 모델·격리 방식·도구 보유 상태(MCP 연결 여부)를
  함께 적어야 실패가 문서 결함인지 환경 문제인지 판정된다.
- `-session`·`-run-log` 같은 참조용 세션 기록은 이 검증에서 면제한다.
