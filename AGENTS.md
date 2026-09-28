# AGENTS.md

이 저장소에서 일하는 코딩 에이전트(Claude Code·Codex 등) 공통 지침의 정본이다. Claude Code 는 `CLAUDE.md` 의 `@AGENTS.md` 로 같은 내용을 읽는다. 규칙을 새로 정하거나 고칠 때는 이 파일에 쓴다.

## Project Overview

GPTers AI Toolkit — 코딩 에이전트용 스킬·에이전트·커맨드·훅·가이드를 검색하고 공유하는 플랫폼.
MCP 서버와 `aitk` CLI로 로컬 설치 없이 필요한 순간에 스킬을 불러온다.
사내 AX(AI Transformation) 대시보드도 같은 앱에 들어 있다.

## Project Structure

Turbo + pnpm 모노레포다. **루트에 `app/`·`components/`·`lib/`·`plugins/`는 없다.**

```
gpters-ai-toolkit/
├── apps/
│   ├── web/                  # @gpters/web — Next.js 앱 (모든 페이지·API)
│   ├── aitk-cli/             # @gpters/aitk — npm CLI (검색·배포·텔레메트리 수집)
│   ├── claude-code-plugin/   # Claude Code 마켓플레이스 플러그인
│   ├── codex-plugin/         # @gpters/codex-plugin
│   └── opencode-plugin/      # @gpters/opencode
├── packages/
│   ├── db/                   # @gpters/db — Drizzle 스키마 + 마이그레이션
│   ├── lib/                  # @gpters/lib — 공유 로직 (MCP, auth, AX, search)
│   └── tsconfig/             # 공유 TS 설정
├── design-system/aitk/       # 디자인 토큰
├── infra/                    # ax-local(도커 검증 환경), agent-telemetry
├── docs/                     # 문서 · docs/plans/에 작업 인수인계
└── scripts/                  # 일회성 마이그레이션·동기화 스크립트
```

## Commands

루트 스크립트는 전부 turbo 위임이다. 한 패키지만 돌릴 때는 `--filter`를 쓴다.

```bash
# Development
pnpm dev                    # turbo dev (web은 port 3000)
pnpm build                  # turbo build

# Linting & Testing
pnpm lint                   # turbo lint
pnpm test                   # turbo test — web은 tests/unit만 실행한다
pnpm typecheck              # turbo typecheck
pnpm test:api               # turbo test:api (격리 DB 필수, 아래 주의 참고)
pnpm test:e2e               # turbo test:e2e (Playwright)

# 특정 패키지만
corepack pnpm --filter @gpters/web exec vitest run tests/unit/<file>
corepack pnpm --filter @gpters/web exec dotenv -e ../../.env.local -- next dev -H 127.0.0.1 -p 3000

# Database (Drizzle + Neon PostgreSQL)
pnpm db:generate            # 마이그레이션 생성
pnpm db:push                # 스키마 push
pnpm db:studio              # Drizzle Studio
# 운영 마이그레이션은 packages/db의 guarded runner를 쓴다 (아래 "DB 마이그레이션")
```

## Architecture

### Tech Stack

- **Next.js 16** (App Router), **React 19**, TypeScript
- **Tailwind CSS v4**
- **Drizzle ORM** + **Neon PostgreSQL** (serverless)
- **NextAuth v5 (beta)** + Google OAuth, 자체 OAuth 2.1 provider(`/oauth`, `/.well-known`)
- **next-intl** — locale `ko`(기본) / `en`. 페이지 경로는 전부 `app/[locale]/…`
- **Vitest** (unit/API), **Playwright** (E2E)

### Key Directories

```
apps/web/
├── app/
│   ├── [locale]/         # 페이지 — skill, agent, command, hook, package,
│   │                     #   guides, templates, admin, profile, stats, ax,
│   │                     #   getting-started, welcome, auth, device, privacy, terms
│   ├── api/              # API 라우트 (catalog, mcp, ax, admin, oauth 지원 등)
│   ├── oauth/            # OAuth 2.1 authorize/token/register
│   └── .well-known/      # OAuth 디스커버리
├── components/           # React 컴포넌트 (~73개). components/ax는 AX 대시보드 화면
├── lib/                  # 대부분 @gpters/lib 재수출 shim + 웹 전용 유틸
│   └── mcp/, features/, core/auth.ts …
├── middleware.ts         # 인증 게이트 + locale 라우팅
└── tests/{unit,api,e2e}/

packages/lib/src/
├── mcp/                  # MCP 서버 (tools.ts가 도구 정의 정본)
├── features/ax/          # AX 대시보드 데이터 계층 — 패널 레지스트리
├── account-access/       # 로그인 허용 판정
├── security/             # RBAC
├── search/, agent/, analytics/, versioning/, reports/, notifications/

packages/db/
├── src/schema.ts         # 모든 테이블 정본
├── drizzle/              # 0001~00NN 마이그레이션 SQL
└── scripts/              # guarded 운영 마이그레이션 runner + preflight
```

### Data Model

`item_type` enum 6종: `skill`, `agent`, `command`, `guide`, `hook`, `package`

주요 테이블 (`packages/db/src/schema.ts`):

| 영역 | 테이블 |
|------|--------|
| 카탈로그 | `catalog_items`, `catalog_item_translations`, `catalog_item_tags`, `tags`, `package_items`, `item_versions` |
| 계정·조직 | `users`, `organizations`, `org_memberships`, `org_invitations` |
| OAuth | `oauth_clients`, `oauth_codes`, `oauth_access_tokens`, `oauth_refresh_tokens`, `device_codes` |
| 사용 추적 | `skill_events`, `mcp_audit_logs`, `mcp_sessions`, `suggestions` |
| AX | `ax_subscriptions`, `ax_client_usage`, `ax_usage_collector_state`, `ax_skill_execution_attempts`, `ax_skill_execution_events`, `ax_agent_telemetry_batches`, `ax_agent_telemetry_collectors` |

`authors` 테이블은 없다 — 저자는 `catalog_items.author_id` → `users`다.

#### Files Field & FileType

Catalog items can include additional files via `files` field (JSON array):

```typescript
files: [
  { name: "scripts/run.mjs", content: "...", type: "script" },
  { name: "references/guide.md", content: "...", type: "reference" }
]
```

| FileType | Purpose | Claude Action |
|----------|---------|---------------|
| `script` | Executable scripts (js, sh, py) | Run with node/bash |
| `reference` | Reference docs/guides | Read for context |
| `template` | Project templates | Copy to destination |
| `config` | Configuration files | Add to settings |

Type is auto-inferred from filename if not specified.

### Environment Variables

`.env.local`에 둔다 (`.env.example` 참고). 주요 키:

- `DATABASE_URL` — Neon PostgreSQL 연결 문자열
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` — 인증
- `INTERNAL_ORGANIZATION_DOMAIN` — AX 대시보드 접근 도메인. **비어 있으면 전원 차단된다**
- `GH_TOKEN`, `GH_OWNER`, `GH_REPO`, `GH_BRANCH` — GitHub API (스킬 비교·동기화)
- `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID` — 배포 사이트 패널
- `BBOPTERS_SHARED_REPO`, `AX_AGENT_TELEMETRY_TOKEN` — AX 공유 스킬·에이전트 텔레메트리
- `DEV_BYPASS_AUTH=true` — 개발 전용 인증 우회 (`NODE_ENV=development`에서만 동작)

### Authentication Flow

- `apps/web/middleware.ts`가 모든 경로를 막고, `isPublicRoute()`에 나열된 경로만 통과시킨다
  (`/auth`, `/api/auth`, `/api/mcp`, `/api/cli-token`, `/api/device`, `/oauth`, `/.well-known`,
  `/welcome`, `/privacy`, `/api/skills`, `/api/models`, `/api/cron`, `/api/ax/agent-telemetry` 등).
- 로그인 허용은 **하드코딩된 단일 도메인이 아니다.** `apps/web/lib/core/auth-config.ts`의 `signIn` 콜백이
  `isAllowedAccountEmail()` → 이메일 도메인과 `organizations.allowedDomains`가 겹치는 활성 조직이
  하나라도 있어야 통과시킨다. 정지(`suspended`) 계정은 거부한다.
- RBAC 역할: `super_admin` / `admin` / `editor` / `viewer` (`packages/lib/src/security`).
- 개발 우회: `.env.local`에 `DEV_BYPASS_AUTH=true` (미들웨어·AX 양쪽 모두 `NODE_ENV` 이중 게이트).

### Plugin Structure

Claude Code 마켓플레이스는 루트 `.claude-plugin/marketplace.json`과 `apps/claude-code-plugin/`이다.
Codex·OpenCode 플러그인은 각각 `apps/codex-plugin`, `apps/opencode-plugin`에서 npm으로 배포한다.
개별 스킬·에이전트 콘텐츠는 파일이 아니라 **DB(`catalog_items`)에 있다.**

### API Patterns

- API 라우트는 App Router 관례(`route.ts`)를 따른다.
- 관리자 API는 admin 역할 세션을 요구한다 (RBAC).
- 카탈로그 API는 미들웨어 인증 통과 후 조직 가시성 규칙을 적용한다.

### MCP Server

**Endpoint**: `/api/mcp`

도구 정의 정본은 `packages/lib/src/mcp/tools.ts`다. 현재 등록된 도구:

| 도구 | 용도 |
|------|------|
| `semantic_search` | 의미 기반 스킬 검색 |
| `get_plugin_content` | 스킬 전체 내용 로드 |
| `deploy_skill` / `undeploy_skill` | 팀에 배포 / 배포 취소 |
| `add_files` / `remove_files` | 스킬에 파일 추가·제거 |
| `check_updates` | 설치된 스킬 업데이트 확인 |
| `report_session_event`, `report_usage` | 세션·사용량 보고 |
| `report_search_skip`, `report_skill_outcome` | 검색 스킵·적용 결과 보고 |
| `report_skill_execution_started`, `report_skill_execution` | 실행 시작·결과 보고 |

`search_plugins`, `list_plugins`, `get_plugins_by_category`, `suggest_improvement`는 **더 이상 없다**
(옛 이름은 `mcp_audit_logs` 과거 행에만 남아 있다).

**Claude Code Integration** (OAuth 2.1):

```bash
claude mcp add gpters-ai-toolkit https://ai-toolkit.gpters.org/api/mcp -t http
```

브라우저에서 Google 로그인 후 자동 연결된다.

See `docs/TEAM_ONBOARDING.md` for team member setup guide.
See `docs/DEPLOYMENT_GUIDE.md` for deployment.

## AX 대시보드

사내 AX 지표 화면(`/[locale]/ax`). 데이터 계층은 `packages/lib/src/features/ax/`, 화면은
`apps/web/components/ax/`다.

- **패널 레지스트리 구조**: `features/ax/registry.ts`의 `AX_PANELS` 배열 + 단일 라우트
  `app/api/ax/[panel]/route.ts`. 지표를 추가할 때 라우트를 새로 만들지 않는다.
- 최상위 탭은 `parentId` 없는 패널(`overview` / `skill-usage` / `client-usage` / `vercel-deployments`),
  나머지는 하위 탭이다. `hidden: true` 패널(`activity-grass`)은 탭에 안 나오고 데이터만 쓰인다.
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

## Development Guidelines

### Test Requirements

**모든 기능 작업 완료 시 관련 테스트 코드 작성 필수:**

| 작업 유형 | 테스트 위치 | 테스트 프레임워크 |
|----------|------------|-----------------|
| API 엔드포인트 | `apps/web/tests/api/` | Vitest |
| 유틸리티/라이브러리 | `apps/web/tests/unit/`, `packages/*/tests/` | Vitest |
| 주요 사용자 흐름 | `apps/web/tests/e2e/` | Playwright |

`tests/api`·`tests/e2e` 는 데이터를 바꾼다 — 실행 전에 아래 「테스트 데이터 안전」을 따른다.

**테스트 체크리스트:**
- [ ] 성공 케이스 테스트
- [ ] 에러/엣지 케이스 테스트
- [ ] `pnpm test` 통과 확인
- [ ] `pnpm lint` 통과 확인

### TSDoc Documentation Requirements

**모든 TypeScript/TSX 파일에 TSDoc 문서화 필수:**

이 프로젝트는 100% TSDoc 커버리지를 유지합니다. 새 파일 생성 또는 기존 파일 수정 시 반드시 TSDoc을 작성하세요.

**필수 TSDoc 요소:**

| 요소 | TSDoc 필수 여부 | 예시 |
|------|----------------|------|
| 파일 헤더 | ✅ 필수 | `/** 파일 목적 설명 */` |
| exported 함수/컴포넌트 | ✅ 필수 | `/** 함수 설명 \n * @param name - 설명 \n * @returns 설명 */` |
| exported interface/type | ✅ 필수 | `/** 인터페이스 설명 */` |
| Props interface 속성 | ✅ 필수 | `/** 속성 설명 */ propName: string` |
| 내부 함수/변수 | ❌ 선택 | 복잡한 로직에만 추가 |

**TSDoc 형식:**

```typescript
// 파일 헤더 (모든 파일 최상단)
/**
 * 파일 목적 한 줄 설명
 *
 * 상세 설명 (필요시)
 */

// 함수/컴포넌트
/**
 * 함수 목적 설명
 *
 * @param paramName - 파라미터 설명
 * @returns 반환값 설명
 */
export function functionName(paramName: string): Result {

// Interface
/**
 * 인터페이스 목적 설명
 */
export interface ComponentProps {
  /** 속성 설명 */
  propName: string
  /** 선택적 속성 설명 */
  optionalProp?: number
}

// React 컴포넌트
/**
 * 컴포넌트 목적 및 사용 케이스 설명
 */
export function ComponentName({ prop }: ComponentProps) {
```

**'use client' 파일:**
- TSDoc은 `'use client'` 디렉티브 **다음에** 작성

```typescript
'use client'

/**
 * 클라이언트 컴포넌트 설명
 */
```

### UI 시각 검증 범위

아래 「대시보드 UI 시각 검증」은 AX 대시보드뿐 아니라 **모든 화면**의 레이아웃·차트·범례·문구 변경에 적용한다.

### Push 전 필수 확인사항

```bash
pnpm lint && pnpm test && pnpm build
```

**체크리스트:**
- [ ] `pnpm lint` 통과 확인
- [ ] `pnpm test` 통과 확인 (**모든 테스트가 통과해야 함**)
- [ ] `pnpm build` 성공 확인
- [ ] **TSDoc 문서화** - 새로 생성/수정한 파일에 TSDoc 작성 확인

빌드나 테스트 실패 시 Vercel 배포도 실패하므로, 로컬에서 먼저 모든 검증을 확인하는 것이 중요합니다.

> `pnpm typecheck`는 이번 작업과 무관한 기존 타입 오류가 남아 있어 red다
> (테스트 matcher 타입, MCP response unknown, `packages/lib` 경로 별칭 등).
> 회귀 판단은 대상 테스트 + `pnpm build`로 한다.

### 팀 스킬 활용 가이드

새 작업을 시작하기 전에 팀이 공유한 스킬이 있는지 확인한다. 이 저장소의 기본 검색 경로는 `aitk` CLI다
(플러그인 0.1.24부터 `UserPromptSubmit` 훅으로 힌트를 넣지 않으므로 직접 검색한다).

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

## 테스트 데이터 안전

- `@gpters/web test`는 기본적으로 `tests/unit`만 실행한다.
- `tests/api`와 `tests/e2e`에는 카탈로그·태그·MCP 서버를 생성·수정·삭제하는 테스트가 있다.
- 현재 개발 서버나 운영·공유 DB를 바라보는 서버에는 API/E2E 전체 테스트를 실행하지 않는다.
- API 테스트는 격리된 일회용 DB와 그 DB를 바라보는 전용 서버를 준비하고,
  `TEST_API_URL`, `TEST_DATABASE_URL`, `CONFIRM_ISOLATED_API_TESTS=run-mutating-api-tests`를
  모두 명시한 경우에만 실행한다.
- 실행 전후 DB 브랜치 ID와 `test-*` 잔여 레코드 수를 확인한다.

## 대시보드 UI 시각 검증

- AX 대시보드의 레이아웃·차트·범례·문구를 바꾸면 자동화 테스트만으로 완료 처리하지 않는다.
- 로컬 개발 서버에서 브라우저 또는 디자인 검수 도구로 데스크톱 화면을 직접 확인한다.
- 범례 간격, 텍스트 줄바꿈, 막대 겹침, 밝은·어두운 테마의 대비, 가로 스크롤과 잘림을 확인한다.
- 운영 데이터를 읽는 로컬 화면에서는 조회만 수행하고, 운영·공유 DB를 변경하는 API/E2E 검증은 실행하지 않는다.


## Agent telemetry rollout

에이전트 수집기를 신규 설치·업데이트·검증할 때는
`infra/agent-telemetry/PROTOCOL.md`를 먼저 읽는다.
공개 저장소에는 범용 코드와 익명 예시만 두고, 실제 소유자·호스트·경로·인증·운영 증거는
비공개로 관리한다. 설치 완료와 서버 적재 확인은 별도 상태로 보고한다.


## UI 작업 완료 후 로컬 확인

- UI 구현·수정 후에는 사용자가 직접 확인할 수 있도록 해당 변경이 반영된 로컬 개발 서버를 켜 둔다. 검수 완료만을 이유로 종료하지 않는다.
- 완료 응답에는 접속 URL, 확인할 메뉴·영역, 직접 해볼 동작을 함께 안내한다.
- 합성 데이터 미리보기와 실제 데이터 화면, 로컬 반영과 운영 배포를 명확히 구분한다.
- 기존 사용자 서버를 임의로 종료하거나 포트를 빼앗지 않는다. 다른 포트를 사용했다면 실제 주소를 알린다.

## 사내 에이전트 감시 작업 인수인계

- 이 작업을 재개할 때 `.local/ops/agent-monitoring/HANDOFF.md`가 있으면 먼저 읽는다. 현재 상태와 다음 행동은 HANDOFF, 코드·근거 링크는 CONTEXT, 과정·정정 이력은 LOG에 둔다.
- 작성일과 마지막 실제 검증일을 구분하고, 과거 완료·승인·설치 상태가 현재도 같다고 추정하지 않는다.
- 실제 운영 맥락과 증거는 Git에서 제외된 비공개 경로에 유지한다. 다른 머신에서 해당 파일이 없으면 승인된 비공개 인수인계 경로를 확인하고 공개 문서로 복사하지 않는다.

## 핸드오프 문서 작성

- `docs/plans/`의 `-handoff`·`-runbook` 문서를 쓰거나 크게 고칠 때는 `handoff` 스킬을 따른다.
  커밋 전에 낮은 티어 에이전트 둘(claude sonnet · codex gpt-5.6-terra)에게 문서만 주고
  실제로 이어받게 해 본 뒤, 미리 봉인한 의도와 대조한다.
- 이 세션의 메모리에만 있는 사실은 다음 에이전트에게 없다. 문서에 적거나, 문서가 제시하는
  명령으로 다시 얻을 수 있게 한다.
- 문서 하단에 검증 블록을 남긴다. 검증자의 모델·격리 방식·도구 보유 상태(MCP 연결 여부)를
  함께 적어야 실패가 문서 결함인지 환경 문제인지 판정된다.
- `-session`·`-run-log` 같은 참조용 세션 기록은 이 검증에서 면제한다.
