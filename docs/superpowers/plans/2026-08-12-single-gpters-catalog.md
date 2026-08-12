# Single GPTers Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI Toolkit catalog item belong to the GPTers organization and remove all behavioral and UI distinctions between public and private items.

**Architecture:** Keep the existing `org_id` and `visibility` database columns as compatibility fields, but normalize all production rows to the GPTers organization with `visibility='public'`. Catalog reads stop applying visibility filters, catalog writes always use the authenticated GPTers organization and public compatibility value, and admin/CLI surfaces stop offering organization or visibility choices.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle ORM, PostgreSQL, Vitest, Tailwind CSS v4.

## Global Constraints

- Exact `@gpters.org` authentication remains the outer access boundary for web, CLI, and MCP.
- Preserve all catalog content, IDs, versions, ownership, and external-source metadata.
- Keep legacy request/response fields for backward compatibility, but ignore caller-supplied visibility.
- Reuse the existing AITK design system and only remove obsolete controls and columns.

---

### Task 1: Lock the single-catalog contract with tests

**Files:**
- Create: `apps/web/tests/unit/single-catalog-policy.test.ts`
- Modify: `apps/web/tests/unit/mcp-handlers.test.ts`

**Interfaces:**
- Consumes: catalog route source, MCP `deploySkill`, and catalog query implementations.
- Produces: regression assertions that visibility filters are absent and new writes store the public compatibility value.

- [ ] Add a source-level policy test that checks catalog, search, stats, and MCP read paths do not branch on `catalogItems.visibility`.
- [ ] Add a deployment test proving a caller-supplied `private` value is ignored.
- [ ] Run the focused tests and confirm they fail for the old visibility behavior.

### Task 2: Normalize catalog storage

**Files:**
- Create: `packages/db/drizzle/0024_single_gpters_catalog.sql`

**Interfaces:**
- Consumes: the unique active organization with slug `gpters`.
- Produces: every `catalog_items.org_id` set to GPTers and every `catalog_items.visibility` set to `public`.

- [ ] Write a guarded migration that fails if exactly one GPTers organization is not present.
- [ ] Update all catalog rows without deleting content or organizations.
- [ ] Validate the migration in a transaction and roll it back during pre-deploy verification.

### Task 3: Remove visibility behavior from server paths

**Files:**
- Modify: `packages/lib/src/core/catalog.ts`
- Modify: `packages/lib/src/mcp/handlers.ts`
- Modify: `packages/lib/src/search/vector-search.ts`
- Modify: `packages/lib/src/search/full-text-search.ts`
- Modify: `packages/lib/src/features/ax/skills.ts`
- Modify: `apps/web/app/api/catalog/route.ts`
- Modify: `apps/web/app/api/catalog/[id]/route.ts`
- Modify: `apps/web/app/api/stats/route.ts`

**Interfaces:**
- Consumes: existing authentication and RBAC boundaries.
- Produces: identical catalog read results for every authenticated GPTers user; all new catalog rows retain `visibility='public'` for schema compatibility.

- [ ] Remove visibility predicates and private-item detail denials from read paths.
- [ ] Force web and MCP creation to the session organization and public compatibility value.
- [ ] Ignore visibility changes on update paths.
- [ ] Run focused tests until green.

### Task 4: Remove obsolete controls from user-facing surfaces

**Files:**
- Modify: `apps/web/app/[locale]/admin/catalog/new/page.tsx`
- Modify: `apps/web/app/[locale]/admin/catalog/[id]/edit/page.tsx`
- Modify: `apps/web/app/[locale]/admin/catalog/page.tsx`
- Modify: `apps/aitk-cli/bin/aitk.ts`
- Modify: `packages/lib/src/mcp/types.ts`

**Interfaces:**
- Consumes: single GPTers organization server policy.
- Produces: no organization selector, visibility selector, visibility table column, or CLI visibility documentation.

- [ ] Remove organization/visibility form state, fetching, payload fields, filters, badges, and help copy.
- [ ] Keep deprecated MCP input accepted but document it as ignored only if required for compatibility.
- [ ] Verify the admin pages render without unused imports or state.

### Task 5: Verify, release, and apply

**Files:**
- Modify: LLM Wiki project and monthly timeline pages after successful production verification.

**Interfaces:**
- Consumes: tested commit and guarded SQL migration.
- Produces: deployed single-catalog application and normalized production data.

- [ ] Run focused tests, full web tests, lint, typecheck/build, and review the diff.
- [ ] Commit task files only, push the exact commit, and wait for GitHub/Vercel success.
- [ ] Dry-run the production migration, apply it once, then verify 0 non-GPTers org rows and 0 private rows.
- [ ] Verify representative web and MCP catalog access and update the LLM Wiki.
