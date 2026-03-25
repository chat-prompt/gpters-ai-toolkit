# 플랫폼 호환성 필터링 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 카탈로그 아이템에 `platforms` 필드를 추가하여 배포 시 호환 플랫폼을 지정하고, 검색 시 클라이언트 타입에 따라 자동 필터링한다.

**Architecture:** DB에 `platforms text[]` 컬럼 추가 → MCP deploy_skill에 `platforms` 파라미터 추가 → semantic_search에서 클라이언트 타입 기반 자동 필터링 → 웹 UI에 플랫폼 배지 및 필터 추가. `platforms`가 null이면 모든 플랫폼 호환(하위호환).

**Tech Stack:** Drizzle ORM, PostgreSQL, Next.js App Router, React, Tailwind CSS v4, Vitest

---

### Task 1: DB 스키마에 `platforms` 컬럼 추가

**Files:**
- Modify: `packages/db/src/schema.ts:39-107` (catalogItems 테이블)

**Step 1: Write the failing test**

```typescript
// packages/db/src/__tests__/schema-platforms.test.ts
import { describe, it, expect } from 'vitest'
import { catalogItems } from '../schema'

describe('catalogItems schema', () => {
  it('should have platforms column defined', () => {
    const columns = catalogItems[Symbol.for('drizzle:Columns')] ?? catalogItems
    // platforms 컬럼이 스키마에 정의되어 있는지 확인
    expect(catalogItems.platforms).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm vitest run packages/db/src/__tests__/schema-platforms.test.ts`
Expected: FAIL — `catalogItems.platforms` is undefined

**Step 3: Add `platforms` column to schema**

`packages/db/src/schema.ts` — `catalogItems` 테이블 정의 내, `dependencies` 아래에 추가:

```typescript
  // Platform compatibility (null = all platforms)
  platforms: text('platforms').array(),
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm vitest run packages/db/src/__tests__/schema-platforms.test.ts`
Expected: PASS

**Step 5: Generate migration**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm db:generate`
Expected: Migration file generated for adding `platforms` column

**Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/__tests__/schema-platforms.test.ts
git commit -m "feat(db): add platforms column to catalog_items for platform filtering"
```

---

### Task 2: TypeScript 타입에 `platforms` 추가

**Files:**
- Modify: `packages/lib/src/core/types.ts:50-102` (CatalogItem interface)
- Modify: `packages/lib/src/security/client-type.ts` (PLATFORM_LABELS 상수 추가)

**Step 1: CatalogItem에 platforms 필드 추가**

`packages/lib/src/core/types.ts` — `CatalogItem` interface 내, `dependencies` 아래에 추가:

```typescript
  platforms?: string[] // 호환 플랫폼 목록 (null이면 전체 호환). 값: ClientType에서 'web_browser', 'unknown' 제외
```

**Step 2: client-type.ts에 플랫폼 표시용 상수 추가**

`packages/lib/src/security/client-type.ts` 파일 맨 아래에 추가:

```typescript
/**
 * 스킬 호환성에 사용되는 플랫폼 타입 (배포/검색 필터용)
 * web_browser, cli, unknown은 스킬 실행 플랫폼이 아니므로 제외
 */
export const SKILL_PLATFORMS = ['claude_code', 'opencode', 'codex', 'cursor'] as const
export type SkillPlatform = typeof SKILL_PLATFORMS[number]

/**
 * 플랫폼 표시 레이블 및 색상 (UI용)
 */
export const PLATFORM_LABELS: Record<SkillPlatform, { label: string; shortLabel: string; color: string }> = {
  claude_code: { label: 'Claude Code', shortLabel: 'Claude', color: 'bg-orange-100 text-orange-800' },
  opencode: { label: 'OpenCode', shortLabel: 'Open', color: 'bg-blue-100 text-blue-800' },
  codex: { label: 'Codex', shortLabel: 'Codex', color: 'bg-green-100 text-green-800' },
  cursor: { label: 'Cursor', shortLabel: 'Cursor', color: 'bg-purple-100 text-purple-800' },
}
```

**Step 3: Run lint to verify**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/lib/src/core/types.ts packages/lib/src/security/client-type.ts
git commit -m "feat(types): add platforms field and platform label constants"
```

---

### Task 3: MCP deploy_skill에 `platforms` 파라미터 추가

**Files:**
- Modify: `packages/lib/src/mcp/types.ts:61-78` (DeploySkillInput)
- Modify: `packages/lib/src/mcp/types.ts:123-133` (PluginSummary)
- Modify: `packages/lib/src/mcp/types.ts:135-166` (PluginContent)
- Modify: `packages/lib/src/mcp/tools.ts:300-408` (deploy_skill inputSchema)
- Modify: `packages/lib/src/mcp/handlers.ts` (deploySkill 함수, executeTool의 semantic_search 분기)

**Step 1: Write the failing test**

```typescript
// packages/lib/src/mcp/__tests__/deploy-platforms.test.ts
import { describe, it, expect } from 'vitest'
import type { DeploySkillInput, PluginSummary } from '../types'

describe('DeploySkillInput platforms field', () => {
  it('should accept platforms array', () => {
    const input: DeploySkillInput = {
      type: 'skill',
      name: 'Test Skill',
      content: '# Test',
      platforms: ['claude_code', 'codex'],
    }
    expect(input.platforms).toEqual(['claude_code', 'codex'])
  })

  it('should be optional (undefined means all platforms)', () => {
    const input: DeploySkillInput = {
      type: 'skill',
      name: 'Test Skill',
      content: '# Test',
    }
    expect(input.platforms).toBeUndefined()
  })
})

describe('PluginSummary platforms field', () => {
  it('should include platforms in summary', () => {
    const summary: PluginSummary = {
      id: 'test',
      name: 'Test',
      type: 'skill',
      description: 'desc',
      authorName: 'author',
      tags: [],
      platforms: ['codex'],
    }
    expect(summary.platforms).toEqual(['codex'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm vitest run packages/lib/src/mcp/__tests__/deploy-platforms.test.ts`
Expected: FAIL — `platforms` does not exist in type

**Step 3: Add platforms to MCP types**

`packages/lib/src/mcp/types.ts` — `DeploySkillInput`에 추가:

```typescript
  platforms?: string[]           // 호환 플랫폼 (null이면 전체)
```

`packages/lib/src/mcp/types.ts` — `PluginSummary`에 추가:

```typescript
  platforms?: string[]
```

`packages/lib/src/mcp/types.ts` — `PluginContent`에 추가:

```typescript
  platforms?: string[]
```

**Step 4: Add platforms to deploy_skill tool schema**

`packages/lib/src/mcp/tools.ts` — deploy_skill의 `inputSchema.properties`에 추가 (files 앞):

```typescript
        platforms: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['claude_code', 'opencode', 'codex', 'cursor'],
          },
          description: '호환 플랫폼 목록. 미지정 시 모든 플랫폼에서 사용 가능. 예: ["claude_code", "codex"]',
        },
```

**Step 5: Update deploySkill handler**

`packages/lib/src/mcp/handlers.ts` — `deploySkill` 함수에서:

1. input destructuring에 `platforms` 추가
2. DB insert/update 시 `platforms` 포함

deploySkill 함수의 destructuring (616행 근처):
```typescript
  const {
    ...
    dependencies,
    platforms,  // 추가
  } = input
```

DB insert 데이터 객체에 추가:
```typescript
    platforms: platforms || null,
```

DB update 데이터에 조건부 추가:
```typescript
    ...(platforms !== undefined && { platforms: platforms || null }),
```

**Step 6: Update semantic_search response에 platforms 포함**

`packages/lib/src/mcp/handlers.ts` — semantic_search 분기(1582행 근처)에서 PluginSummary 매핑에 추가:

```typescript
            platforms: item.platforms || undefined,
```

**Step 7: Update get_plugin_content response에 platforms 포함**

handlers.ts의 `getPluginContent` 함수 반환값에 platforms 추가.

**Step 8: Run tests**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm vitest run packages/lib/src/mcp/__tests__/deploy-platforms.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add packages/lib/src/mcp/types.ts packages/lib/src/mcp/tools.ts packages/lib/src/mcp/handlers.ts packages/lib/src/mcp/__tests__/deploy-platforms.test.ts
git commit -m "feat(mcp): add platforms parameter to deploy_skill and search responses"
```

---

### Task 4: semantic_search에 플랫폼 자동 필터링 추가

**Files:**
- Modify: `packages/lib/src/search/vector-search.ts:11-21` (SemanticSearchOptions)
- Modify: `packages/lib/src/search/vector-search.ts:29-241` (semanticSearch 함수)
- Modify: `packages/lib/src/mcp/handlers.ts` (executeTool → semantic_search에 clientType 전달)
- Modify: `packages/lib/src/mcp/handlers.ts:1521-1527` (executeTool 시그니처에 clientType 추가)
- Modify: `packages/lib/src/mcp/server.ts:78-88` (handleToolsCall에 clientType 전달)

**Step 1: Write the failing test**

```typescript
// packages/lib/src/search/__tests__/platform-filter.test.ts
import { describe, it, expect } from 'vitest'

describe('platform filtering logic', () => {
  // 필터링 로직만 단위 테스트 (DB 없이)
  it('should match when item has no platforms (null = all)', () => {
    const itemPlatforms: string[] | null = null
    const clientType = 'claude_code'
    const shouldShow = itemPlatforms === null || itemPlatforms.includes(clientType)
    expect(shouldShow).toBe(true)
  })

  it('should match when item platforms include client type', () => {
    const itemPlatforms = ['claude_code', 'codex']
    const clientType = 'claude_code'
    const shouldShow = itemPlatforms === null || itemPlatforms.includes(clientType)
    expect(shouldShow).toBe(true)
  })

  it('should NOT match when item platforms exclude client type', () => {
    const itemPlatforms = ['codex']
    const clientType = 'claude_code'
    const shouldShow = itemPlatforms === null || itemPlatforms.includes(clientType)
    expect(shouldShow).toBe(false)
  })

  it('should show all when client type is unknown or web_browser', () => {
    const clientType = 'web_browser'
    // web_browser나 unknown은 필터링하지 않음
    const shouldFilter = !['web_browser', 'unknown', 'cli'].includes(clientType)
    expect(shouldFilter).toBe(false)
  })
})
```

**Step 2: Run test to verify it passes (순수 로직 테스트)**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm vitest run packages/lib/src/search/__tests__/platform-filter.test.ts`
Expected: PASS (순수 로직이므로 바로 통과)

**Step 3: Add clientType to SemanticSearchOptions**

`packages/lib/src/search/vector-search.ts`:

```typescript
export interface SemanticSearchOptions {
  // ... existing fields
  /** MCP 클라이언트 타입 (플랫폼 필터링용) */
  clientType?: string
}
```

**Step 4: Add platform filter condition to semanticSearch**

`packages/lib/src/search/vector-search.ts` — semanticSearch 함수의 conditions 배열에 추가 (type 필터 다음):

```typescript
  // Platform compatibility filtering
  // web_browser, cli, unknown은 필터링하지 않음 (모든 스킬 노출)
  if (clientType && !['web_browser', 'unknown', 'cli'].includes(clientType)) {
    conditions.push(
      or(
        sql`${catalogItems.platforms} IS NULL`,
        sql`${catalogItems.platforms} @> ARRAY[${clientType}]::text[]`
      )!
    )
  }
```

동일 로직을 keyword fallback 쿼리에도 적용.

**Step 5: Thread clientType through executeTool → semanticSearch**

`packages/lib/src/mcp/handlers.ts` — `executeTool` 시그니처 변경:

```typescript
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  userRole?: string,
  orgId?: string,
  clientType?: string   // 추가
): Promise<McpToolResponse> {
```

semantic_search case에서 semanticSearchImpl 호출에 clientType 전달:

```typescript
        const searchResult = await semanticSearchImpl({
          query: input.query,
          type: input.category,
          limit: Math.min(input.limit || 5, 20),
          userId,
          userRole,
          orgId,
          userContext: input.userContext,
          clientType,  // 추가
        })
```

**Step 6: Thread clientType through server.ts**

`packages/lib/src/mcp/server.ts` — `handleToolsCall`과 `handleSimpleRequest`에 clientType 파라미터 추가하고 executeTool에 전달.

서버의 JSON-RPC 핸들러에서 세션에 저장된 clientType을 전달. (이미 MCP initialize에서 clientInfo를 추출하고 있으므로 해당 값을 활용)

**Step 7: Run all tests**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm test`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/lib/src/search/vector-search.ts packages/lib/src/search/__tests__/platform-filter.test.ts packages/lib/src/mcp/handlers.ts packages/lib/src/mcp/server.ts
git commit -m "feat(search): auto-filter search results by client platform type"
```

---

### Task 5: 웹 UI에 플랫폼 배지 추가

**Files:**
- Modify: `apps/web/components/catalog/SearchableCatalog/ItemCard.tsx`
- Modify: `apps/web/components/catalog/SearchableCatalog/types.ts` (ItemCardProps에 platforms 추가, 또는 CatalogItemSummary에서 이미 상속)

**Step 1: ItemCard에 플랫폼 배지 렌더링**

`apps/web/components/catalog/SearchableCatalog/ItemCard.tsx` — Tags 섹션과 Footer 사이에 platforms 배지 추가:

```tsx
        {/* Platform Badges */}
        {item.platforms && item.platforms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {item.platforms.map((platform) => {
              const info = PLATFORM_LABELS[platform as SkillPlatform]
              if (!info) return null
              return (
                <span
                  key={platform}
                  className={`text-[9px] px-1.5 py-0.5 rounded-md ${info.color} font-medium`}
                >
                  {info.shortLabel}
                </span>
              )
            })}
          </div>
        )}
```

platforms가 null/undefined이면 배지를 표시하지 않음 (= 모든 플랫폼 호환이므로 굳이 표시 불필요).

**Step 2: Import PLATFORM_LABELS**

```typescript
import { PLATFORM_LABELS, type SkillPlatform } from '@/lib/security/client-type'
```

(`@/lib`은 `packages/lib/src`를 가리키는 alias인지, 아니면 `apps/web/lib`인지 확인 필요 — 기존 import 패턴 따르기)

**Step 3: Run build to verify**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add apps/web/components/catalog/SearchableCatalog/ItemCard.tsx
git commit -m "feat(ui): show platform compatibility badges on catalog cards"
```

---

### Task 6: 웹 검색에 플랫폼 필터 UI 추가

**Files:**
- Modify: `apps/web/components/catalog/SearchableCatalog/SearchableCatalog.tsx`

**Step 1: 플랫폼 필터 드롭다운/칩 추가**

SearchableCatalog의 필터 영역에 플랫폼 필터 칩 추가:

```tsx
{/* Platform Filter */}
<div className="flex flex-wrap gap-2">
  {SKILL_PLATFORMS.map((platform) => {
    const info = PLATFORM_LABELS[platform]
    const isActive = selectedPlatform === platform
    return (
      <button
        key={platform}
        onClick={() => setSelectedPlatform(isActive ? null : platform)}
        className={`text-xs px-3 py-1.5 rounded-full transition-all ${
          isActive
            ? `${info.color} ring-1 ring-current`
            : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}
      >
        {info.label}
      </button>
    )
  })}
</div>
```

**Step 2: 필터 상태 및 로직 추가**

```typescript
const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

// 기존 필터링 로직에 플랫폼 필터 추가
const filteredItems = items.filter((item) => {
  // ... existing filters
  if (selectedPlatform) {
    if (item.platforms && !item.platforms.includes(selectedPlatform)) return false
    // platforms가 null이면 모든 플랫폼 호환이므로 통과
  }
  return true
})
```

**Step 3: Run build**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add apps/web/components/catalog/SearchableCatalog/SearchableCatalog.tsx
git commit -m "feat(ui): add platform filter to catalog search"
```

---

### Task 7: DB 마이그레이션 적용 및 기존 데이터 호환성 확인

**Step 1: Push schema to database**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm db:push`
Expected: `platforms` 컬럼 추가됨 (nullable text[], 기존 행은 null)

**Step 2: 기존 스킬 확인**

기존 모든 스킬은 `platforms = null`이므로 모든 플랫폼에 노출됨.
새로 배포할 때만 platforms를 지정하면 됨.

**Step 3: 전체 테스트 및 빌드 확인**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm lint && pnpm test && pnpm build`
Expected: ALL PASS

**Step 4: Commit (migration files if any)**

```bash
git add -A drizzle/
git commit -m "chore(db): add platforms column migration"
```

---

### Task 8: semantic_search response에 platforms 포함 (select 쿼리 업데이트)

**Files:**
- Modify: `packages/lib/src/search/vector-search.ts` (select 필드에 `platforms` 추가)

vector-search.ts의 `semanticSearch` 함수와 `findSimilarItems` 함수 모두 select 목록에 `platforms: catalogItems.platforms` 추가 필요.

3곳의 select 쿼리에 모두 추가:
1. 메인 semantic search (95행 근처)
2. keyword fallback (172행 근처)
3. findSimilarItems (259행 근처)

```typescript
      platforms: catalogItems.platforms,
```

**Step 1: 추가 후 테스트**

Run: `cd /Users/primadonna/projects/gpters-ai-toolkit && pnpm test`
Expected: PASS

**Step 2: Commit**

```bash
git add packages/lib/src/search/vector-search.ts
git commit -m "feat(search): include platforms field in search query results"
```

---

## 변경 범위 요약

| 파일 | 변경 내용 |
|------|----------|
| `packages/db/src/schema.ts` | `platforms text[]` 컬럼 추가 |
| `packages/lib/src/core/types.ts` | `CatalogItem.platforms` 필드 추가 |
| `packages/lib/src/security/client-type.ts` | `SKILL_PLATFORMS`, `PLATFORM_LABELS` 상수 추가 |
| `packages/lib/src/mcp/types.ts` | `DeploySkillInput`, `PluginSummary`, `PluginContent`에 platforms 추가 |
| `packages/lib/src/mcp/tools.ts` | deploy_skill inputSchema에 platforms 파라미터 추가 |
| `packages/lib/src/mcp/handlers.ts` | deploySkill에 platforms 저장, executeTool에 clientType 전달, 응답에 platforms 포함 |
| `packages/lib/src/mcp/server.ts` | clientType을 executeTool에 전달 |
| `packages/lib/src/search/vector-search.ts` | clientType 기반 플랫폼 필터링, select에 platforms 추가 |
| `apps/web/components/.../ItemCard.tsx` | 플랫폼 배지 UI |
| `apps/web/components/.../SearchableCatalog.tsx` | 플랫폼 필터 UI |

## 사용 시나리오

```
# Codex 전용 스킬 배포
deploy_skill(type="skill", name="Codex Deploy Guide", platforms=["codex"], ...)

# Claude Code + OpenCode 호환 스킬 배포
deploy_skill(type="skill", name="Git Commit Helper", platforms=["claude_code", "opencode"], ...)

# 모든 플랫폼 호환 (기존 방식)
deploy_skill(type="skill", name="Security Guide", ...)  # platforms 생략 = 전체

# Codex에서 검색 시 → Codex 호환 스킬만 반환
semantic_search(query="deploy guide")
# → platforms=null인 스킬 + platforms에 "codex" 포함된 스킬만 반환
```
