# EDU-7987 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open MCP `deploy_skill` author edits, force changelog on every update, and fully deprecate the suggest feature (server + aitk CLI).

**Architecture:** Three layered changes — (1) drop the author guard in `deploySkill` so any authenticated org member can update; (2) flip `changelog` to a required input across MCP, REST, Admin UI, and aitk CLI by tightening `createVersionOnUpdate` and adding upstream validation; (3) physically remove the suggest tool surface (3 MCP tools, 3 CLI commands, REST handler, analytics enum case) while marking the `suggestions` DB table deprecated for a later drop PR.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, Vitest, TypeScript, pnpm Turbo monorepo, Bun-built aitk CLI.

**Spec:** `docs/plans/2026-05-18-edu-7987-design.md`

---

## Branch Setup

- [ ] **Step 0.1: Create feature branch**

Run:
```bash
git checkout -b primadonna/edu-7987
```
Expected: `Switched to a new branch 'primadonna/edu-7987'`

---

## Task 1: Remove MCP author check in `deploySkill`

**Files:**
- Modify: `packages/lib/src/mcp/handlers.ts:705-716`
- Test: `apps/web/tests/unit/mcp-tools.test.ts` (new test block, may need `apps/web/tests/unit/deploy-skill.test.ts` if file missing)

- [ ] **Step 1.1: Locate the test file for deploySkill behavior**

Run:
```bash
ls apps/web/tests/unit/ | grep -i deploy
```
Expected: Either `deploy-skill.test.ts` exists, or none — if none, create `apps/web/tests/unit/deploy-skill.test.ts`.

- [ ] **Step 1.2: Write failing test — author 외 사용자 업데이트 성공**

Add to `apps/web/tests/unit/deploy-skill.test.ts` (create file if missing). This test mocks DB so it runs without a live Neon connection:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => {
  const existing = {
    id: 'sample-skill',
    content: 'old content',
    version: '1.0.0',
    authorId: 'original-author',
    files: null,
  }
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([existing]),
      }),
    }),
  })
  return {
    db: {
      select,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...existing, content: 'new content' }]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'v-id' }]),
        }),
      }),
    },
    catalogItems: { id: 'id' },
    users: { id: 'id' },
    suggestions: { id: 'id' },
  }
})

import { deploySkill } from '@gpters/lib/mcp/handlers'

describe('deploySkill — author check removed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets a non-author org member update an existing skill', async () => {
    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
        changelog: 'updated by collaborator',
      },
      'collaborator-id', // <- not the authorId
      'editor',
      'org-1'
    )
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})
```

- [ ] **Step 1.3: Run test, confirm it fails**

Run:
```bash
pnpm --filter web test -- deploy-skill
```
Expected: FAIL with `본인이 배포한 플러그인만 업데이트할 수 있습니다`.

- [ ] **Step 1.4: Remove the author check block**

In `packages/lib/src/mcp/handlers.ts`, delete the entire `if (existingItem.authorId !== authorId && !hasAdminRole) { ... }` block at lines 705-716. Keep the `if (!authorId) { ... }` block above (auth required check). Remove the now-unused `hasAdminRole` constant if it has no other reference in the function (grep within the function body to confirm).

- [ ] **Step 1.5: Run test, confirm it passes**

Run:
```bash
pnpm --filter web test -- deploy-skill
```
Expected: PASS

- [ ] **Step 1.6: Commit**

```bash
git add packages/lib/src/mcp/handlers.ts apps/web/tests/unit/deploy-skill.test.ts
git commit -m "feat(mcp): remove deploy_skill author guard (EDU-7987 D1)"
```

---

## Task 2: Make `changelog` required in `createVersionOnUpdate`

**Files:**
- Modify: `packages/lib/src/versioning/skill-version.ts:280-311`
- Test: `apps/web/tests/unit/skill-version.test.ts`

- [ ] **Step 2.1: Write failing test — changelog is enforced by type system**

Add to `apps/web/tests/unit/skill-version.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { createVersionOnUpdate } from '@/lib/versioning/skill-version'

describe('createVersionOnUpdate signature', () => {
  it('requires changelog in options', () => {
    type Options = Parameters<typeof createVersionOnUpdate>[2]
    expectTypeOf<Options>().toHaveProperty('changelog')
    // changelog must be a required string (not optional)
    expectTypeOf<Options['changelog']>().toEqualTypeOf<string>()
  })
})
```

- [ ] **Step 2.2: Run test, confirm it fails (currently optional)**

Run:
```bash
pnpm --filter web test -- skill-version
```
Expected: FAIL — current type is `changelog?: string`.

- [ ] **Step 2.3: Change signature and drop summary fallback**

In `packages/lib/src/versioning/skill-version.ts`, replace the function body (lines 280-311):

```typescript
/**
 * Create a new version when an item is updated.
 *
 * @param item - Updated catalog item record
 * @param previousContent - Content before the update (for change analysis)
 * @param options.changelog - Required human-written summary of the change (no auto-fallback)
 * @param options.createdBy - User ID of the editor
 * @returns The newly created version row, or null when content has no significant change
 */
export async function createVersionOnUpdate(
  item: CatalogItemRecord,
  previousContent: string,
  options: { changelog: string; createdBy?: string }
): Promise<ItemVersionRecord | null> {
  const analysis = analyzeChanges(previousContent, item.content)
  if (!analysis.hasChanges) {
    return null
  }

  let versionType: VersionType = 'patch'
  if (analysis.breaking) versionType = 'major'
  else if (analysis.newFeatures) versionType = 'minor'

  const currentVersion = item.version || '1.0.0'
  const newVersion = incrementVersion(currentVersion, versionType)

  return createVersionSnapshot(item, {
    version: newVersion,
    versionType,
    changelog: options.changelog,
    createdBy: options.createdBy,
  })
}
```

- [ ] **Step 2.4: Run test, confirm it passes**

Run:
```bash
pnpm --filter web test -- skill-version
```
Expected: PASS

- [ ] **Step 2.5: Run typecheck to surface every required-changelog call site**

Run:
```bash
pnpm --filter web exec tsc --noEmit
```
Expected: TypeScript errors at every `createVersionOnUpdate` call site that doesn't pass `changelog`. These are the call sites we'll fix in Tasks 3 & 4. Note the file:line list output.

- [ ] **Step 2.6: Commit**

```bash
git add packages/lib/src/versioning/skill-version.ts apps/web/tests/unit/skill-version.test.ts
git commit -m "feat(versioning): require changelog in createVersionOnUpdate (EDU-7987 D4)"
```

---

## Task 3: Enforce changelog in `deploySkill`

**Files:**
- Modify: `packages/lib/src/mcp/handlers.ts` (around `deploySkill` body, post-Task-1)
- Test: `apps/web/tests/unit/deploy-skill.test.ts`

- [ ] **Step 3.1: Write failing tests for the new validation**

Append to `apps/web/tests/unit/deploy-skill.test.ts`:

```typescript
describe('deploySkill — changelog enforcement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects update without changelog', async () => {
    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
        // no changelog
      },
      'collaborator-id',
      'editor',
      'org-1'
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('changelog')
  })

  it('rejects update with whitespace-only changelog', async () => {
    const result = await deploySkill(
      {
        id: 'sample-skill',
        type: 'skill',
        name: 'Sample',
        content: 'new content',
        changelog: '   ',
      },
      'collaborator-id',
      'editor',
      'org-1'
    )
    expect(result.success).toBe(false)
  })

  it('auto-fills "Initial release" for new deployments', async () => {
    // override mock: existing returns []
    const { db } = await import('@gpters/db')
    ;(db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    const result = await deploySkill(
      {
        id: 'brand-new',
        type: 'skill',
        name: 'New Skill',
        content: 'hello',
        description: 'desc',
        tags: ['x'],
        // no changelog
      },
      'collaborator-id',
      'editor',
      'org-1'
    )
    expect(result.success).toBe(true)
    expect(result.changelog).toBe('Initial release')
  })
})
```

- [ ] **Step 3.2: Run tests, confirm 2 of 3 fail**

Run:
```bash
pnpm --filter web test -- deploy-skill
```
Expected: First two cases FAIL (no validation yet), third may pass or fail depending on current fallback.

- [ ] **Step 3.3: Add the validation in `deploySkill`**

In `packages/lib/src/mcp/handlers.ts`, within `deploySkill`, locate the spot where the existing `isUpdate` check happens (the block previously containing the author guard). Insert immediately AFTER the author guard removal (Task 1) and BEFORE `createVersionOnUpdate` is called:

```typescript
// Enforce changelog: required on updates, auto-fill on new deployments
let effectiveChangelog = explicitChangelog?.trim() ?? ''
if (isUpdate) {
  if (!effectiveChangelog) {
    return {
      success: false,
      id,
      version: existingItem!.version || '1.0.0',
      changelog: '',
      status: 'published',
      webUrl: '',
      error: '업데이트 시 changelog는 필수입니다. 이번 변경 사유를 한 줄 이상 적어주세요.',
    }
  }
} else if (!effectiveChangelog) {
  effectiveChangelog = 'Initial release'
}
```

Then update every downstream reference: replace `explicitChangelog` (or the previous fallback expression) with `effectiveChangelog` in the `createVersionOnUpdate` call, response payload, and any `changelog: ...` field that was using the old value.

- [ ] **Step 3.4: Run tests, confirm all pass**

Run:
```bash
pnpm --filter web test -- deploy-skill
```
Expected: all 4 tests pass (1 from Task 1 + 3 new).

- [ ] **Step 3.5: Commit**

```bash
git add packages/lib/src/mcp/handlers.ts apps/web/tests/unit/deploy-skill.test.ts
git commit -m "feat(mcp): enforce changelog on deploy_skill updates (EDU-7987 D3)"
```

---

## Task 4: Enforce changelog in REST `PUT /api/catalog/[id]`

**Files:**
- Modify: `apps/web/app/api/catalog/[id]/route.ts:76-165`
- Test: `apps/web/tests/api/catalog-changelog.test.ts` (new)

- [ ] **Step 4.1: Inspect current PUT handler to locate the change-detection branch**

Run:
```bash
sed -n '76,165p' apps/web/app/api/catalog/[id]/route.ts
```
Note: find where `createVersionOnUpdate` is called (line ~149) and where the request body is parsed.

- [ ] **Step 4.2: Write failing API test**

Create `apps/web/tests/api/catalog-changelog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PUT } from '@/app/api/catalog/[id]/route'

vi.mock('@/lib/security/auth', () => ({
  requirePermissionAsync: vi.fn().mockResolvedValue({
    userId: 'u1',
    orgId: 'org-1',
    role: 'editor',
  }),
}))

// (mock the catalog read/update path similar to deploy-skill.test.ts;
// reuse the same db mock pattern — copy-paste the @gpters/db mock from
// deploy-skill.test.ts)

describe('PUT /api/catalog/[id] — changelog enforcement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects content change without changelog', async () => {
    const req = new Request('http://localhost/api/catalog/sample-skill', {
      method: 'PUT',
      body: JSON.stringify({ content: 'new content' }), // no changelog
    })
    const res = await PUT(req as any, { params: Promise.resolve({ id: 'sample-skill' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('changelog')
  })

  it('accepts content change with changelog', async () => {
    const req = new Request('http://localhost/api/catalog/sample-skill', {
      method: 'PUT',
      body: JSON.stringify({ content: 'new content', changelog: 'meaningful update' }),
    })
    const res = await PUT(req as any, { params: Promise.resolve({ id: 'sample-skill' }) })
    expect(res.status).toBe(200)
  })

  it('accepts metadata-only update without changelog (hasChanges=false)', async () => {
    const req = new Request('http://localhost/api/catalog/sample-skill', {
      method: 'PUT',
      body: JSON.stringify({ description: 'new desc' }), // content unchanged
    })
    const res = await PUT(req as any, { params: Promise.resolve({ id: 'sample-skill' }) })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 4.3: Run tests, confirm they fail**

Run:
```bash
pnpm --filter web test -- catalog-changelog
```
Expected: FAIL (no validation present).

- [ ] **Step 4.4: Add changelog validation to PUT handler**

In `apps/web/app/api/catalog/[id]/route.ts`, before invoking `createVersionOnUpdate`, import `analyzeChanges` from `@/lib/versioning/skill-version` (export it if not already), then:

```typescript
import { analyzeChanges, createVersionOnUpdate } from '@/lib/versioning/skill-version'

// ...inside PUT handler, where you have `existing` and `body`...
const hasContentChange = body.content !== undefined &&
  analyzeChanges(existing.content, body.content).hasChanges

if (hasContentChange) {
  const changelog = (body.changelog ?? '').trim()
  if (!changelog) {
    return ApiErrors.badRequest('업데이트 시 changelog는 필수입니다. 이번 변경 사유를 한 줄 이상 적어주세요.')
  }
}

// ...later, when calling createVersionOnUpdate, pass changelog:
await createVersionOnUpdate(updatedItem, existing.content, {
  changelog: (body.changelog ?? '').trim(),
  createdBy: session.userId,
})
```

If `analyzeChanges` is not currently exported from `skill-version.ts`, add it to the export list.

- [ ] **Step 4.5: Run tests, confirm all pass**

Run:
```bash
pnpm --filter web test -- catalog-changelog
```
Expected: 3 PASS.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/app/api/catalog/[id]/route.ts packages/lib/src/versioning/skill-version.ts apps/web/tests/api/catalog-changelog.test.ts
git commit -m "feat(api): enforce changelog on catalog PUT content changes (EDU-7987 D3)"
```

---

## Task 5: aitk CLI deploy `--changelog` option

**Files:**
- Modify: `apps/aitk-cli/src/commands/deploy.ts`
- Modify: `apps/aitk-cli/bin/aitk.ts` (deploy help text + arg parsing)
- Test: `apps/aitk-cli/tests/commands/deploy.test.ts` (new — check tests/commands exists)

- [ ] **Step 5.1: Check whether commands/ test dir exists**

Run:
```bash
ls apps/aitk-cli/tests/commands/ 2>/dev/null || mkdir -p apps/aitk-cli/tests/commands
```
Expected: directory either exists or is created.

- [ ] **Step 5.2: Write failing test**

Create `apps/aitk-cli/tests/commands/deploy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/client.js', () => ({
  apiCall: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
}))
vi.mock('../../src/auth.js', () => ({ resolveToken: () => 'tok' }))
vi.mock('../../src/output.js', () => ({ jsonOut: vi.fn(), error: vi.fn() }))

import { runDeploy } from '../../src/commands/deploy.js'
import { apiCall } from '../../src/client.js'

describe('aitk deploy --changelog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes changelog to the API when provided', async () => {
    await runDeploy({
      id: 'x',
      type: 'skill',
      name: 'X',
      content: 'hi',
      changelog: 'fixed bug',
    } as any)
    expect(apiCall).toHaveBeenCalledWith('deploy', expect.objectContaining({ changelog: 'fixed bug' }), 'tok')
  })

  it('omits changelog when not provided (server decides)', async () => {
    await runDeploy({ id: 'x', type: 'skill', name: 'X', content: 'hi' } as any)
    const [, params] = (apiCall as any).mock.calls[0]
    expect(params.changelog).toBeUndefined()
  })
})
```

- [ ] **Step 5.3: Run test, confirm it fails**

Run:
```bash
pnpm --filter @gpters/aitk test -- deploy
```
Expected: FAIL — `changelog` not in `DeployOptions`.

- [ ] **Step 5.4: Add changelog to DeployOptions and forward to apiCall**

In `apps/aitk-cli/src/commands/deploy.ts`:

```typescript
/** deploy 명령어 옵션 */
export interface DeployOptions {
  /** 영문 slug ID */
  id: string
  /** 아이템 타입 */
  type: string
  /** 표시 이름 */
  name: string
  /** 콘텐츠 (텍스트 또는 @file 경로) */
  content: string
  /** 설명 */
  description?: string
  /** 태그 (콤마 구분) */
  tags?: string
  /** 플랫폼 (콤마 구분) */
  platforms?: string
  /** 공개 범위 */
  visibility?: string
  /** 변경 사유 (업데이트 시 서버에서 필수) */
  changelog?: string
}
```

Then inside `runDeploy`, after the existing optional-param forwards, add:

```typescript
if (opts.changelog) params.changelog = opts.changelog
```

- [ ] **Step 5.5: Add CLI flag parsing in `bin/aitk.ts`**

In the deploy command's arg parsing block (find the case that calls `runDeploy`), add support for `--changelog <text>`. Pattern matches the existing `--description`/`--tags` handling. Update the deploy help block to include:

```
--changelog <text>    Required when updating an existing skill (change summary)
```

- [ ] **Step 5.6: Run test, confirm it passes**

Run:
```bash
pnpm --filter @gpters/aitk test -- deploy
```
Expected: 2 PASS.

- [ ] **Step 5.7: Build CLI**

Run:
```bash
pnpm --filter @gpters/aitk build
```
Expected: clean build.

- [ ] **Step 5.8: Commit**

```bash
git add apps/aitk-cli/src/commands/deploy.ts apps/aitk-cli/bin/aitk.ts apps/aitk-cli/tests/commands/deploy.test.ts
git commit -m "feat(cli): add aitk deploy --changelog option (EDU-7987 D3)"
```

---

## Task 6: Admin edit UI — gate submit on changelog when content is dirty

**Files:**
- Modify: `apps/web/app/[locale]/admin/catalog/[id]/edit/page.tsx`
- (UI test optional — covered by E2E + manual QA in Task 9)

- [ ] **Step 6.1: Read the current edit page to locate content textarea + submit handler**

Run:
```bash
sed -n '1,60p' apps/web/app/[locale]/admin/catalog/[id]/edit/page.tsx
```
Identify: the form state holding `content`, the initial value, and the submit button JSX.

- [ ] **Step 6.2: Add changelog state + dirty detection + submit gate**

Inside the edit page component, add (TSDoc on every new function/var the lint expects):

```typescript
const [changelog, setChangelog] = useState('')
const isContentDirty = content !== initialContent
const isSubmitDisabled = isContentDirty && changelog.trim().length === 0
```

Add a textarea in the form (place near the submit button):

```tsx
{isContentDirty && (
  <div className="mt-4">
    <label className="block text-sm font-medium mb-1">
      변경 사유 (changelog) <span className="text-red-500">*</span>
    </label>
    <textarea
      value={changelog}
      onChange={(e) => setChangelog(e.target.value)}
      placeholder="이번 변경의 핵심을 한 줄 이상 적어주세요"
      className="w-full rounded border px-3 py-2 text-sm"
      rows={3}
      required
    />
    {changelog.trim().length === 0 && (
      <p className="mt-1 text-xs text-red-500">
        콘텐츠가 변경되어 changelog 입력이 필수입니다.
      </p>
    )}
  </div>
)}
```

Update the submit handler to include `changelog: changelog.trim()` in the PUT body, and add `disabled={isSubmitDisabled}` to the submit button.

- [ ] **Step 6.3: Run typecheck + lint**

Run:
```bash
pnpm --filter web exec tsc --noEmit && pnpm lint
```
Expected: clean.

- [ ] **Step 6.4: Manual smoke (dev server)**

Run:
```bash
pnpm dev
```
Open the admin edit page for any skill, edit content, confirm submit button disables when changelog empty. Stop dev server (Ctrl+C).

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/app/[locale]/admin/catalog/[id]/edit/page.tsx
git commit -m "feat(admin): require changelog when editing skill content (EDU-7987 D3)"
```

---

## Task 7: Deprecate suggest feature on the server

**Files:**
- Modify: `packages/lib/src/mcp/handlers.ts` (delete suggest function bodies + switch cases lines 1861-1916)
- Modify: `packages/lib/src/mcp/tools.ts` (delete 3 tool definitions lines 471-551)
- Modify: `packages/lib/src/mcp/types.ts` (delete suggest input/output types)
- Modify: `packages/lib/src/mcp/index.ts` (delete suggest re-exports)
- Modify: `apps/web/app/api/mcp/route.ts:703` (delete suggest_improvement REST branch)
- Modify: `packages/lib/src/analytics/session-tracker.ts:68,96` (delete `'suggest_improvement'` cases)
- Modify: `packages/db/src/schema.ts:827-851` (add deprecation comment, do NOT drop)
- Modify: `apps/web/tests/unit/mcp-tools.test.ts` (update tool list expectations)

- [ ] **Step 7.1: Update mcp-tools.test.ts to expect 10 public tools (was 13)**

In `apps/web/tests/unit/mcp-tools.test.ts`, change:

```typescript
// remove these expectations:
expect(toolNames).toContain('suggest_improvement')
expect(toolNames).toContain('list_suggestions')
expect(toolNames).toContain('resolve_suggestion')

// change:
expect(MCP_TOOLS).toHaveLength(10) // was 13
```

Add a negative test in the same file:

```typescript
describe('Suggest feature removal (EDU-7987 D2)', () => {
  it('does not expose suggest tools', () => {
    const toolNames = MCP_TOOLS.map((t) => t.name)
    expect(toolNames).not.toContain('suggest_improvement')
    expect(toolNames).not.toContain('list_suggestions')
    expect(toolNames).not.toContain('resolve_suggestion')
  })
})
```

- [ ] **Step 7.2: Run test, confirm it fails**

Run:
```bash
pnpm --filter web test -- mcp-tools
```
Expected: FAIL (tools still present).

- [ ] **Step 7.3: Delete suggest tool definitions**

In `packages/lib/src/mcp/tools.ts`, delete the three objects with `name: 'suggest_improvement'`, `name: 'list_suggestions'`, `name: 'resolve_suggestion'` (around lines 471-551). Run `pnpm --filter web exec tsc --noEmit` to surface dangling imports/exports.

- [ ] **Step 7.4: Delete suggest handler cases and function bodies**

In `packages/lib/src/mcp/handlers.ts`:
- Delete the `case 'suggest_improvement':`, `case 'list_suggestions':`, `case 'resolve_suggestion':` blocks (around lines 1861, 1888, 1901).
- Delete the `export async function suggestImprovement`, `listSuggestions`, `resolveSuggestion` function bodies.
- Remove `suggestions` from the `@gpters/db` import (line 8) if no longer used elsewhere in this file (grep to confirm).

- [ ] **Step 7.5: Delete suggest types**

In `packages/lib/src/mcp/types.ts`, delete `SuggestImprovementInput`, `SuggestImprovementResponse`, `ListSuggestionsInput`, `ListSuggestionsResponse`, `ResolveSuggestionInput`, `ResolveSuggestionResponse` (or whatever the actual names are — grep before deleting).

- [ ] **Step 7.6: Clean up index.ts re-exports**

In `packages/lib/src/mcp/index.ts`, remove any `export { suggestImprovement, listSuggestions, resolveSuggestion }` and related type exports.

- [ ] **Step 7.7: Delete REST handler branch**

In `apps/web/app/api/mcp/route.ts` around line 703, delete the `if (tool === 'suggest_improvement') { ... }` block. If there are sibling branches for `list_suggestions` / `resolve_suggestion`, delete those too.

- [ ] **Step 7.8: Delete analytics session-tracker cases**

In `packages/lib/src/analytics/session-tracker.ts:68,96`, delete the `case 'suggest_improvement':` blocks. Note: do NOT remove `'suggest'` from the `mcp_audit_logs` enum in schema.ts — historical rows must remain readable.

- [ ] **Step 7.9: Mark `suggestions` table as deprecated**

In `packages/db/src/schema.ts` immediately above the `export const suggestions = pgTable('suggestions', { ... })` declaration (line 827), add:

```typescript
/**
 * @deprecated 2026-05-18 — Suggest feature removed (EDU-7987 D2).
 * Table retained for 1 month; drop in a separate migration PR.
 * Do not write new rows. Reads only for historical inspection.
 */
```

- [ ] **Step 7.10: Run full test suite + build**

Run:
```bash
pnpm --filter web test && pnpm --filter web exec tsc --noEmit
```
Expected: PASS. If any test referenced suggest types/handlers, delete those tests (they describe removed behavior).

- [ ] **Step 7.11: Commit**

```bash
git add packages/lib/src/mcp/handlers.ts packages/lib/src/mcp/tools.ts packages/lib/src/mcp/types.ts packages/lib/src/mcp/index.ts apps/web/app/api/mcp/route.ts packages/lib/src/analytics/session-tracker.ts packages/db/src/schema.ts apps/web/tests/unit/mcp-tools.test.ts
git commit -m "feat(mcp): remove suggest_improvement/list_suggestions/resolve_suggestion (EDU-7987 D2)"
```

---

## Task 8: Deprecate suggest commands in aitk CLI

**Files:**
- Delete: `apps/aitk-cli/src/commands/suggest.ts`
- Delete: `apps/aitk-cli/src/commands/suggestions.ts`
- Delete: `apps/aitk-cli/src/commands/resolve.ts`
- Modify: `apps/aitk-cli/bin/aitk.ts` (remove imports lines 19-21, help blocks lines 251-281, switch cases)
- Modify: `apps/aitk-cli/package.json` (remove 3 build entries, bump version)

- [ ] **Step 8.1: Write failing CLI bin test**

Create `apps/aitk-cli/tests/bin/help.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const binSrc = readFileSync(new URL('../../bin/aitk.ts', import.meta.url), 'utf-8')

describe('aitk bin — suggest removal (EDU-7987 D2)', () => {
  it('has no suggest/suggestions/resolve imports', () => {
    expect(binSrc).not.toMatch(/runSuggest\b/)
    expect(binSrc).not.toMatch(/runSuggestions\b/)
    expect(binSrc).not.toMatch(/runResolve\b/)
  })
  it('has no help text for suggest commands', () => {
    expect(binSrc).not.toMatch(/aitk suggest -/)
    expect(binSrc).not.toMatch(/aitk suggestions -/)
    expect(binSrc).not.toMatch(/aitk resolve -/)
  })
})
```

- [ ] **Step 8.2: Run test, confirm it fails**

Run:
```bash
pnpm --filter @gpters/aitk test -- help
```
Expected: FAIL.

- [ ] **Step 8.3: Delete command source files**

Run:
```bash
rm apps/aitk-cli/src/commands/suggest.ts apps/aitk-cli/src/commands/suggestions.ts apps/aitk-cli/src/commands/resolve.ts
```

- [ ] **Step 8.4: Clean bin/aitk.ts**

In `apps/aitk-cli/bin/aitk.ts`:
- Delete lines 19-21 (`import { runSuggest } ...` and the two siblings).
- Delete the three help blocks around lines 251-281 (each starting with `\`aitk suggest -` / `aitk suggestions -` / `aitk resolve -`).
- Delete the three `case 'suggest':`, `case 'suggestions':`, `case 'resolve':` switch arms (grep to find exact lines).

- [ ] **Step 8.5: Update package.json build script + bump version**

In `apps/aitk-cli/package.json`:
- Remove `src/commands/suggest.ts`, `src/commands/suggestions.ts`, `src/commands/resolve.ts` from the `build` script entries.
- Change `"version": "0.4.0"` → `"version": "0.5.0"`.

- [ ] **Step 8.6: Run test + build, confirm pass**

Run:
```bash
pnpm --filter @gpters/aitk test && pnpm --filter @gpters/aitk build
```
Expected: PASS + clean build.

- [ ] **Step 8.7: Commit**

```bash
git add apps/aitk-cli/src/commands/ apps/aitk-cli/bin/aitk.ts apps/aitk-cli/package.json apps/aitk-cli/tests/bin/help.test.ts
git commit -m "feat(cli)!: remove suggest/suggestions/resolve commands, bump to v0.5.0 (EDU-7987 D2)"
```

---

## Task 9: Final verification

**Files:** (none)

- [ ] **Step 9.1: Repo-wide lint**

Run:
```bash
pnpm lint
```
Expected: 0 errors.

- [ ] **Step 9.2: Repo-wide test**

Run:
```bash
pnpm test
```
Expected: all suites pass.

- [ ] **Step 9.3: Repo-wide build**

Run:
```bash
pnpm build
```
Expected: clean.

- [ ] **Step 9.4: Manual QA checklist (dev server)**

Run:
```bash
pnpm dev
```
Walk through:
- [ ] Brand new skill deploy via MCP/aitk → succeeds, version shows "Initial release"
- [ ] Update existing skill without `--changelog` via aitk → server returns 400 with Korean message
- [ ] Update existing skill with `--changelog "x"` as a non-author user → succeeds, VersionPopover shows new row with `createdBy` = the editor
- [ ] Admin edit page → editing content disables submit until changelog filled
- [ ] Header bell shows update with changelog first line
- [ ] Calling old `suggest_improvement` via MCP → unknown tool error

Stop dev server.

- [ ] **Step 9.5: Push branch and open PR**

Run:
```bash
git push -u origin primadonna/edu-7987
gh pr create --title "feat(toolkit): open author edits, enforce changelog, deprecate suggest (EDU-7987)" --body "$(cat <<'EOF'
## Summary
- Removes MCP `deploy_skill` author guard so any authenticated org member can update a skill
- Enforces `changelog` on every content-changing update (MCP, REST PUT, Admin UI, aitk CLI)
- Drops `createVersionOnUpdate` auto-summary fallback (typed `changelog` now required)
- Removes suggest_improvement/list_suggestions/resolve_suggestion (MCP tools + REST handler + aitk CLI commands + analytics enum cases). DB `suggestions` table marked deprecated, drop deferred to a follow-up migration PR.
- Bumps aitk CLI to 0.5.0 (breaking)

## Spec
- `docs/plans/2026-05-18-edu-7987-design.md`

## Test plan
- [x] pnpm lint
- [x] pnpm test
- [x] pnpm build
- [x] Manual QA checklist (Task 9.4)

Closes EDU-7987
EOF
)"
```
Expected: PR URL printed.

---

## Self-Review

- ✅ Spec coverage:
  - D1 (author check removed) → Task 1
  - D2 (suggest deprecation server + CLI) → Tasks 7, 8
  - D3 (changelog UI/API enforced) → Tasks 3, 4, 5, 6
  - D4 (auto summary fallback removed) → Task 2
  - D5 (`suggestions` table drop deferred) → Task 7.9 (deprecation comment, no drop)
  - D6 (no new UI components) → only Task 6 modifies UI in-place
  - D7 (no webhooks) → not in plan ✓
- ✅ Placeholder scan: no TBD/TODO; every step has explicit code, command, and expected output
- ✅ Type consistency: `effectiveChangelog` introduced in Task 3 is consumed where Task 2's typed `changelog: string` is passed to `createVersionOnUpdate`; `analyzeChanges` exported in Task 4 is imported in PUT handler
