# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GPTers AI Toolkit - a web platform for sharing Claude Code skills, agents, commands, and guides. Internal tool for the GPTers team with Google OAuth restricted to `@gpters.org` domain.

## Monorepo Structure

```
gpters-ai-toolkit/
├── web/               # Next.js 16 application (main package)
├── plugins/           # Claude Code plugin definitions
├── marketplace/       # Claude Code marketplace sync directory
└── docs/              # Documentation
```

## Commands

All commands run from repository root using pnpm workspaces:

```bash
# Development
pnpm dev                    # Start Next.js dev server (port 3000)
pnpm build                  # Production build

# From web/ directory:
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

### Key Directories (web/)

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
├── auth.ts           # NextAuth configuration
├── catalog.ts        # Catalog data access functions
├── types.ts          # TypeScript types and constants
└── marketplace/      # GitHub marketplace sync utilities

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

Required in `web/.env.local` (see `.env.example`):
- `DATABASE_URL` - Neon PostgreSQL connection string
- `ADMIN_PASSWORD` - Admin dashboard access
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
- Admin APIs require `ADMIN_PASSWORD` in Authorization header
- Catalog APIs are public (after auth middleware)

### MCP Server

The project includes an MCP (Model Context Protocol) server for dynamic plugin discovery:

**Endpoint**: `/api/mcp`

**Available Tools**:
- `search_plugins` - Search plugins by keyword
- `get_plugin_content` - Get full plugin content
- `list_plugins` - List all plugins
- `get_plugins_by_category` - Get plugins by category

**Available Prompts** (NEW):
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
