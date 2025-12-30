# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GPTers AI Toolkit - a web platform for sharing Claude Code skills, agents, commands, and guides. Internal tool for the GPTers team with Google OAuth restricted to `@gpters.org` domain.

## Project Structure

```
gpters-ai-toolkit/
├── app/               # Next.js App Router pages and API routes
├── components/        # React components
├── lib/               # Utility functions and services
├── plugins/           # Claude Code plugin definitions
├── docs/              # Documentation
├── tests/             # Test files (unit, API, E2E)
└── public/            # Static assets
```

## Commands

```bash
# Development
pnpm dev                    # Start Next.js dev server (port 3000)
pnpm build                  # Production build

# Linting & Testing
pnpm lint                   # ESLint
pnpm test                   # Vitest unit + API tests
pnpm test:watch             # Vitest watch mode
pnpm test:api               # API tests only (tests/api/)
pnpm test:e2e               # Playwright E2E tests
pnpm test:e2e:ui            # Playwright with UI
pnpm test:all               # All tests (unit + e2e)

# Database (Drizzle + Neon PostgreSQL)
pnpm db:generate            # Generate migrations
pnpm db:push                # Push schema to database
pnpm db:studio              # Open Drizzle Studio
pnpm db:migrate-data        # Run data migration script
```

## Architecture

### Tech Stack
- **Next.js 16** with App Router, React 19, TypeScript
- **Tailwind CSS v4** for styling
- **Drizzle ORM** with **Neon PostgreSQL** (serverless)
- **NextAuth v5 (beta)** with Google OAuth
- **Vitest** for unit/API tests, **Playwright** for E2E

### Key Directories

```
app/
├── api/              # API routes (catalog, auth, marketplace, admin)
├── admin/            # Admin dashboard (catalog CRUD, tags, authors)
├── auth/             # Auth pages (signin, signout, error)
├── guides/           # Guide pages
├── skill/[id]/       # Skill detail pages
├── agent/[id]/       # Agent detail pages
└── command/[id]/     # Command detail pages

lib/
├── db/               # Drizzle schema and connection
├── mcp/              # MCP server for plugin discovery
├── marketplace/      # GitHub marketplace sync utilities
├── auth.ts           # NextAuth configuration
├── catalog.ts        # Catalog data access functions
├── types.ts          # TypeScript types and constants
└── version.ts        # Version management for V2 deploy

components/           # React components (SearchableCatalog, InstallGuide, etc.)
tests/
├── api/              # API integration tests
└── e2e/              # Playwright E2E tests
```

### Data Model

Four main item types: `skill`, `agent`, `command`, `guide`

Key database tables:
- `catalog_items` - Main content table with type-specific fields
- `users` - OAuth users
- `authors`, `tags`, `mcp_servers` - Normalized reference data
- `catalog_item_tags` - Many-to-many junction table

### Environment Variables

Required in `.env.local` (see `.env.example`):
- `DATABASE_URL` - Neon PostgreSQL connection string
- `GH_TOKEN`, `GH_OWNER`, `GH_REPO`, `GH_BRANCH` - GitHub API for marketplace sync
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `DEV_BYPASS_AUTH=true` - Skip auth in development

### Authentication Flow

- Middleware (`middleware.ts`) protects all routes except `/auth/*` and `/api/auth/*`
- Only `@gpters.org` email domain allowed (configured in `lib/auth.ts`)
- Dev bypass: set `DEV_BYPASS_AUTH=true` in `.env.local`

### Plugin Structure

Plugins in `/plugins/` directory follow Claude Code plugin format:
```
plugins/plugin-name/
├── .claude-plugin/   # Plugin configuration
├── agents/           # Agent definitions
└── README.md         # Plugin documentation
```

### API Patterns

- API routes use Next.js App Router conventions (`route.ts`)
- Admin APIs require session with admin role (RBAC)
- Catalog APIs are public (after auth middleware)

### MCP Server

The project includes an MCP (Model Context Protocol) server for dynamic plugin discovery:

**Endpoint**: `/api/mcp`

**Available Tools**:
- `search_plugins` - Search plugins by keyword
- `get_plugin_content` - Get full plugin content
- `list_plugins` - List all plugins
- `get_plugins_by_category` - Get plugins by category
- `deploy_skill` - Deploy skill/agent/command to team (V2)
- `check_updates` - Check for installed skill updates (V2)

**Available Prompts**:
- All plugins are also exposed as MCP prompts
- Invoke via `/mcp__gpters-marketplace__<plugin-id>`
- Example: `/mcp__gpters-marketplace__code-reviewer`

**Usage Modes**:
```bash
# Simple REST API
POST /api/mcp?action=search  {"query": "database"}
POST /api/mcp?action=get     {"pluginId": "data-source-reference"}
POST /api/mcp?action=list    {}

# JSON-RPC 2.0 (MCP Protocol)
POST /api/mcp  {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
POST /api/mcp  {"jsonrpc": "2.0", "id": 1, "method": "prompts/list"}
POST /api/mcp  {"jsonrpc": "2.0", "id": 1, "method": "prompts/get", "params": {"name": "code-reviewer"}}
```

**Claude Code Integration**:
```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://[deployed-url]/api/mcp"
    }
  }
}
```

See `docs/AUTO_PLUGIN_DISCOVERY.md` for detailed documentation.
See `docs/TEAM_ONBOARDING.md` for team member setup guide.
See `docs/ARCHITECTURE_V2.md` for V2 deploy architecture.

## Development Guidelines

### Test Requirements

**모든 기능 작업 완료 시 관련 테스트 코드 작성 필수:**

| 작업 유형 | 테스트 위치 | 테스트 프레임워크 |
|----------|------------|-----------------|
| API 엔드포인트 | `tests/api/` | Vitest |
| 유틸리티/라이브러리 | `tests/` 또는 `*.test.ts` | Vitest |
| 주요 사용자 흐름 | `tests/e2e/` | Playwright |

**테스트 체크리스트:**
- [ ] 성공 케이스 테스트
- [ ] 에러/엣지 케이스 테스트
- [ ] `pnpm test` 통과 확인
- [ ] `pnpm lint` 통과 확인

### Push 전 필수 확인사항

**Git push 전에 반드시 다음 명령어를 실행하여 모든 검증이 통과하는지 확인:**

```bash
pnpm lint && pnpm test && pnpm build
```

**체크리스트:**
- [ ] `pnpm lint` 통과 확인
- [ ] `pnpm test` 통과 확인 (**모든 테스트가 통과해야 함**)
- [ ] `pnpm build` 성공 확인 (TypeScript 에러 없음)

빌드나 테스트 실패 시 Vercel 배포도 실패하므로, 로컬에서 먼저 모든 검증을 확인하는 것이 중요합니다.

### Available Plugins

이 프로젝트는 다음 플러그인을 마켓플레이스에서 제공합니다:

- **claude-code-infrastructure** - Dev Docs 패턴, Context 보존 워크플로우
- **code-reviewer** - 코드 리뷰 서브에이전트
- **data-source-reference** - 데이터 소스 참조 가이드
- **refactor-guide** - 리팩토링 가이드

See `plugins/` directory for all available plugins.
See `docs/CLAUDE_CODE_INFRASTRUCTURE.md` for Claude Code infrastructure patterns.
