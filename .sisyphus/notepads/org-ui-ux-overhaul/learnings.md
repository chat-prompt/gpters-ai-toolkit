# Learnings

## 2026-02-09 Session Start
- Pre-existing LSP errors in `packages/lib/src/core/auth.ts` and `packages/lib/src/security/rbac.ts` — DO NOT attempt to fix
- 108 pre-existing test failures across the suite
- Design system: dark-first glass morphism, badge pattern: `bg-[color]/20 text-[color] border border-[color]/30 rounded-full`
- Type colors: cyan=skill, purple=agent, rose=command, orange=hook, emerald=guide
- DB already has orgId, visibility, sharedWithOrgs on catalogItems
- OrgSwitcher + useOrgContext() hook already working
- Auth is fixed — apps/web/lib/core/auth.ts re-exports from ./auth-config (canonical)
- DEV_BYPASS_AUTH="false" — real OAuth is used
- primadonna@gpters.org is super_admin
- GPTers org: id 013f7459-b9ad-468c-944c-e1b384ed4c68, slug gpters

## Wave 1 Task 2: Badge Components Created
- Created `OrgBadge.tsx` and `VisibilityBadge.tsx` following exact StatusBadge pattern
- Badge pattern: `bg-[color]/20 text-[color] border border-[color]/30 rounded-full font-medium tracking-wide`
- Size variants: `sm` = `text-[10px] px-2 py-0.5`, `md` = `text-xs px-3 py-1`
- OrgBadge: cyan for org-owned items, gray for legacy (null orgName)
- VisibilityBadge: gray=private, blue=shared, emerald=public, null=no render
- Both use emoji icons (🏢, 🔒, 👥, 🌍) with text labels
- TSDoc required per project standards (file header, interface props, component with @example)
- Build passes with pre-existing warnings (crypto in Edge Runtime, unrelated to new components)
- Commit: 8793ce70 "feat(ui): add OrgBadge and VisibilityBadge reusable components"

## 2026-02-09 Wave 1 Task 1: Org-Based Search Filtering

### Implementation Pattern
- **Org filtering pattern**: Replicated from `apps/web/app/api/catalog/route.ts:84-122`
- **Super admin bypass**: Check `userRole === 'super_admin'` to skip org filtering
- **Regular user filtering**: Use `or()` with 4 conditions:
  1. `eq(catalogItems.orgId, currentOrgId)` - own org items
  2. `eq(catalogItems.visibility, 'public')` - public items
  3. `and(eq(visibility, 'shared'), sql\`sharedWithOrgs::jsonb @> ...\`)` - shared items
  4. `isNull(catalogItems.orgId)` - legacy items (migration compatibility)

### Files Modified
1. `packages/lib/src/search/full-text-search.ts`
   - Added `isNull` import from drizzle-orm
   - Updated `SearchOptions` interface: added `currentOrgId?: string` and `userRole?: string`
   - Updated `searchCatalogItems()`: extract new params, add org filtering logic
   - Updated `getAllItems()`: extract new params, add org filtering logic
   - Updated `getFTSSearchSuggestions()`: added params to function signature, add org filtering

2. `apps/web/app/api/catalog/search/route.ts`
   - Added imports: `auth` from `@/lib/core/auth`, `isSuperAdmin` and `UserRole` from `@/lib/security/rbac`
   - Extract session in GET handler: `const session = await auth()`
   - Pass `currentOrgId` and `userRole` to `searchCatalogItems()` and `getFTSSearchSuggestions()`

### Build Status
- ✅ `pnpm build` passed (41.5s)
- ✅ Commit: `54ffda1b` - "fix(api): add org-based filtering to catalog search endpoint"

### Security Notes
- Search endpoint now enforces org access control (was returning ALL items before)
- Super admins see everything; regular users see only accessible items
- Filtering applies to search results AND suggestions
- Consistent with catalog GET endpoint filtering rules
