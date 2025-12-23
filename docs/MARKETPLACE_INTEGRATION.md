# GPTers AI Toolkit - Claude Code Marketplace Integration Plan

## Overview
웹 카탈로그와 Claude Code CLI 마켓플레이스를 통합하여 사용자가 웹에서 검색/탐색하고 CLI에서 `/plugin install`로 설치할 수 있게 함.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│   Web Catalog   │────>│   PostgreSQL DB  │────>│  GitHub Repo            │
│  (Next.js App)  │     │   (Source)       │     │  marketplace/ directory │
└─────────────────┘     └──────────────────┘     └─────────────────────────┘
        │                        │                          │
        │ Browse/Discover        │ Auto-sync on save        │ /plugin install
        ▼                        ▼                          ▼
    ┌──────────┐          ┌─────────────┐           ┌──────────────┐
    │  Users   │          │  GitHub API │           │ Claude Code  │
    │  (Web)   │          │  (Octokit)  │           │    CLI       │
    └──────────┘          └─────────────┘           └──────────────┘
```

## Key Decisions
- **저장소**: 기존 `gpters-ai-toolkit` 저장소에 `marketplace/` 디렉토리 추가
- **동기화**: catalogItem 저장/수정 시 자동으로 GitHub에 반영
- **타입 매핑**: skill, agent, command → 플러그인 | prompt → skill로 변환 | guide → 웹 전용

---

## Implementation Steps

### Phase 1: Database Schema Extension

**File**: `web/lib/db/schema.ts`

```typescript
// Add new fields
marketplaceEnabled: boolean('marketplace_enabled').default(false),
marketplaceSyncedAt: timestamp('marketplace_synced_at', { withTimezone: true }),
marketplaceVersion: text('marketplace_version').default('1.0.0'),
```

**Migration**: Create migration file via `npx drizzle-kit generate`

---

### Phase 2: Marketplace Transformation Library

**New Files**:
- `web/lib/marketplace/types.ts` - 마켓플레이스 타입 정의
- `web/lib/marketplace/transform.ts` - CatalogItem → Plugin 변환 함수
- `web/lib/marketplace/github-sync.ts` - GitHub API 동기화 서비스

**Core Functions**:
```typescript
// transform.ts
function generateMarketplaceJson(items: CatalogItem[]): MarketplaceJson
function transformToSkillMd(item: CatalogItem): string
function transformToAgentMd(item: CatalogItem): string
function transformToCommandMd(item: CatalogItem): string
function generatePluginJson(item: CatalogItem): PluginJson

// github-sync.ts
async function syncItemToGitHub(item: CatalogItem): Promise<SyncResult>
async function syncAllToGitHub(items: CatalogItem[]): Promise<SyncResult>
```

---

### Phase 3: GitHub Repository Structure

**Directory**: `marketplace/` in gpters-ai-toolkit repo

```
marketplace/
├── .claude-plugin/
│   └── marketplace.json          # 마켓플레이스 카탈로그
├── plugins/
│   ├── {skill-id}/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── skills/
│   │   │   └── {skill-id}/
│   │   │       └── SKILL.md
│   │   └── README.md
│   ├── {agent-id}/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── agents/
│   │   │   └── {agent-id}.md
│   │   └── README.md
│   └── {command-id}/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── commands/
│       │   └── {command-id}.md
│       └── README.md
└── README.md
```

**marketplace.json format**:
```json
{
  "name": "gpters-ai-toolkit",
  "owner": { "name": "GPTers", "email": "contact@gpters.org" },
  "metadata": {
    "description": "GPTers AI Toolkit - Claude Code Skills, Agents, and Commands",
    "pluginRoot": "./plugins"
  },
  "plugins": [
    {
      "name": "skill-id",
      "source": "./plugins/skill-id",
      "description": "...",
      "version": "1.0.0",
      "category": "skill",
      "keywords": ["tag1", "tag2"]
    }
  ]
}
```

---

### Phase 4: API Endpoints

**New Files**:
- `web/app/api/marketplace/route.ts` - GET marketplace.json
- `web/app/api/marketplace/sync/route.ts` - POST trigger full sync

```typescript
// GET /api/marketplace - returns marketplace.json format
// POST /api/marketplace/sync - trigger full sync (admin only)
```

---

### Phase 5: Auto-Sync on Save

**Modify**: `web/app/api/catalog/[id]/route.ts`

```typescript
// In PUT handler, after successful DB update:
if (updatedItem.marketplaceEnabled) {
  await syncItemToGitHub(updatedItem)
}
```

**Modify**: `web/app/api/catalog/route.ts`

```typescript
// In POST handler, after successful DB insert:
if (newItem.marketplaceEnabled) {
  await syncItemToGitHub(newItem)
}
```

---

### Phase 6: Admin UI Updates

**Modify**: `web/app/admin/catalog/[id]/edit/page.tsx`

Add marketplace section:
- Toggle: "Enable in Claude Code Marketplace"
- Version input: Semantic version (1.0.0)
- Sync status: Last synced timestamp
- Manual sync button (fallback)

**Modify**: `web/app/admin/catalog/new/page.tsx`

Add same marketplace controls to creation form.

---

### Phase 7: Web Catalog UI Updates

**Modify**: `web/components/InstallGuide.tsx`

Add CLI installation section for marketplace-enabled items:
```
🔌 Install via Claude Code (Recommended)

First, add the GPTers marketplace (one-time):
/plugin marketplace add gpters/gpters-ai-toolkit

Then install this plugin:
/plugin install {item-id}@gpters-ai-toolkit
```

**Modify**: `web/components/ItemCard.tsx`

Add "CLI Ready" badge for marketplace-enabled items.

**New Component**: `web/components/MarketplaceBadge.tsx`

---

### Phase 8: Environment & Configuration

**Add to .env**:
```
GITHUB_TOKEN=ghp_xxx...
GITHUB_OWNER=gpters
GITHUB_REPO=gpters-ai-toolkit
GITHUB_BRANCH=main
MARKETPLACE_PATH=marketplace
```

---

## Type Mapping Summary

| CatalogItem Type | Plugin Structure | Notes |
|------------------|------------------|-------|
| `skill` | `plugins/{id}/skills/{id}/SKILL.md` | Full plugin |
| `agent` | `plugins/{id}/agents/{id}.md` | Full plugin |
| `command` | `plugins/{id}/commands/{id}.md` | Full plugin |
| `prompt` | `plugins/{id}/skills/{id}/SKILL.md` | Convert to skill |
| `guide` | N/A | Web-only, no sync |

---

## SKILL.md Format

```yaml
---
name: skill-name
description: When to use this skill - include trigger keywords for discovery
version: 1.0.0
---

# Skill Title

[Original content from catalogItem.content]
```

---

## Files to Create

1. `web/lib/marketplace/types.ts`
2. `web/lib/marketplace/transform.ts`
3. `web/lib/marketplace/github-sync.ts`
4. `web/app/api/marketplace/route.ts`
5. `web/app/api/marketplace/sync/route.ts`
6. `web/components/MarketplaceBadge.tsx`
7. `marketplace/.claude-plugin/marketplace.json` (initial)
8. `marketplace/README.md`

## Files to Modify

1. `web/lib/db/schema.ts` - Add marketplace fields
2. `web/lib/types.ts` - Extend CatalogItem type
3. `web/app/api/catalog/route.ts` - Auto-sync on create
4. `web/app/api/catalog/[id]/route.ts` - Auto-sync on update
5. `web/app/admin/catalog/[id]/edit/page.tsx` - Marketplace toggle
6. `web/app/admin/catalog/new/page.tsx` - Marketplace toggle
7. `web/components/InstallGuide.tsx` - CLI install guide
8. `web/components/ItemCard.tsx` - CLI Ready badge

---

## User Flow (After Implementation)

1. **Admin enables marketplace** for an item in admin panel
2. **Auto-sync** pushes plugin files to GitHub on save
3. **User discovers** item on web catalog, sees "CLI Ready" badge
4. **User adds marketplace** (one-time): `/plugin marketplace add gpters/gpters-ai-toolkit`
5. **User installs**: `/plugin install {item-id}@gpters-ai-toolkit`
6. **Plugin is active** in Claude Code

---

## Estimated Effort

| Phase | Description | Complexity |
|-------|-------------|------------|
| 1 | DB Schema | Low |
| 2 | Transform Library | Medium |
| 3 | GitHub Structure | Low |
| 4 | API Endpoints | Low |
| 5 | Auto-Sync | Medium |
| 6 | Admin UI | Medium |
| 7 | Catalog UI | Low |
| 8 | Config | Low |
