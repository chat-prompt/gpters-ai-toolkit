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

## Task 3: Catalog ItemCard Badges (Completed)

### Changes Made
1. **API Enhancement** (`apps/web/app/api/catalog/route.ts`):
   - Added `organizations` import from `@/lib/db`
   - Added LEFT JOIN with organizations table: `.leftJoin(organizations, eq(catalogItems.orgId, organizations.id))`
   - Added `orgName: organizations.name` to the select statement
   - This ensures all catalog items now include organization name in the response

2. **Type Update** (`packages/lib/src/core/types.ts`):
   - Added `orgName?: string` field to `CatalogItem` interface
   - This field is populated via JOIN and represents the organization name
   - Follows existing comment pattern for field documentation

3. **ItemCard Component** (`apps/web/components/catalog/SearchableCatalog/ItemCard.tsx`):
   - Imported `OrgBadge` and `VisibilityBadge` components
   - Added new badge section between tags and footer
   - OrgBadge always displays (shows "Legacy" for null orgName)
   - VisibilityBadge only displays for non-private items
   - Maintains consistent spacing with `mb-4` margin

4. **SearchableCatalog Component** (`apps/web/components/catalog/SearchableCatalog/SearchableCatalog.tsx`):
   - Added org context indicator above stats section
   - Shows: "🏢 Showing items accessible to your organization"
   - Subtle text styling with `text-[var(--text-muted)]`
   - Adjusted stats margin from `mt-12` to `mt-6` to accommodate new context line

### Key Patterns
- **Database JOINs**: Use LEFT JOIN for optional relationships (orgId can be null for legacy items)
- **Badge Placement**: Badges go between content and footer for visual hierarchy
- **Conditional Rendering**: Only show VisibilityBadge for non-private items (private is default, no need to show)
- **Consistent Spacing**: Follow existing margin patterns (`mb-4` for sections)
- **Section Comments**: JSX sections use `{/* Comment */}` pattern for clarity

### Build Verification
- `pnpm build` passes successfully
- No TypeScript errors
- All catalog items now include orgName field
- Badges display correctly on all item cards

### Design Decisions
- OrgBadge always visible (even for legacy items) to maintain consistent layout
- VisibilityBadge hidden for private items (reduces visual noise for default state)
- Org context text placed above stats for immediate visibility
- Used building emoji (🏢) for org context to match OrgBadge icon


## Wave 2 Task 4: Admin Catalog Management Page - Org Column & Filter

### Implementation Summary
- Updated `apps/web/app/admin/catalog/page.tsx` to add Organization and Visibility columns
- Added org filter dropdown for super_admin users
- Fetches org list from `/api/organizations` on mount
- Creates orgMap lookup for displaying org names (API returns orgId, not orgName)

### Key Patterns
- **CatalogItem interface**: Added `orgId: string | null` and `visibility: 'private' | 'shared' | 'public' | null`
- **RBAC helpers**: Updated to include `'super_admin'` role in canCreate, canEdit, canDelete
- **Org filter state**: `const [orgFilter, setOrgFilter] = useState<string>('all')`
- **Org lookup map**: `const orgMap = new Map(organizations.map(org => [org.id, org.name]))`
- **Client-side filtering**: Filter by orgId or 'legacy' (null orgId)
- **Conditional rendering**: Org filter only shows for `isSuperAdmin && organizations.length > 0`

### Table Columns Added
1. **Organization column** (after Team):
   - Uses `<OrgBadge orgName={item.orgId ? (orgMap.get(item.orgId) || item.orgId) : null} size="sm" />`
   - Shows org name from lookup map, falls back to orgId if not found, or "Legacy" for null
2. **Visibility column** (after Organization):
   - Uses `<VisibilityBadge visibility={item.visibility ?? null} size="sm" />`
   - Shows private/shared/public badges

### Org Filter UI
- Label: "Org:" with uppercase tracking-wider styling
- Buttons: "All", "Legacy", plus one button per organization
- Active state: cyan background with black text
- Inactive state: tertiary background with muted text
- Building emoji (🏢) prefix for org buttons

### Build Status
- ✅ `pnpm build` passed
- ✅ Pre-existing crypto warning in api-cache.ts (unrelated)
- ✅ Commit: `f2f6ae91` - "feat(ui): add org badges to catalog ItemCard and org context to catalog page"

### Notes
- The catalog API (`/api/catalog/route.ts`) returns `orgId` and `visibility` but NOT `orgName`
- Org names are fetched separately from `/api/organizations` endpoint
- The edit page already had `orgId` and `visibility` in formData (from previous task)
- Filtering is client-side (consistent with existing team filter pattern)
- Super admin sees all items; regular users see only accessible items (handled by API)

## Wave 2 Task 5: Org Selector + Visibility Selector in Admin Forms

### Implementation Pattern
- **Create form** (`apps/web/app/admin/catalog/new/page.tsx`):
  - Added state: `orgId`, `visibility`, `orgs` array
  - Fetch orgs from `/api/organizations` on mount
  - Get session with `useSession()` to check if user is super_admin
  - Get current org from `useOrgContext()` hook
  - Organization selector: super_admin sees dropdown, others see disabled field with current org
  - Visibility selector: 3 radio-style buttons (Private/Shared/Public) with emoji icons
  - Added `visibility` to payload (API already accepts it)

- **Edit form** (`apps/web/app/admin/catalog/[id]/edit/page.tsx`):
  - Same org + visibility selectors as create form
  - Pre-fill from existing item data (`orgId`, `visibility`)
  - Added to formData state and PATCH payload

### UI Pattern
- **Organization selector**:
  - Label: `text-sm text-[var(--text-muted)] uppercase tracking-wider`
  - Super admin: `<select>` with all orgs
  - Regular user: disabled `<div>` showing current org name
  - Input classes: `w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]`

- **Visibility selector**:
  - 3 button-style radio options (Private/Shared/Public)
  - Active: `bg-[var(--accent-cyan)] text-black`
  - Inactive: `bg-[var(--bg-tertiary)] text-[var(--text-muted)]`
  - Emoji icons: 🔒 Private, 👥 Shared, 🌍 Public
  - Help text below explaining each visibility level

### Build Status
- ✅ `pnpm build` passed (15s)
- ✅ Commits: f2f6ae91 (create form), fdb81618 (edit form)

### Notes
- API POST handler already accepts `visibility` (line 171 of route.ts)
- API sets `orgId: currentOrgId || null` from session (line 208)
- For super_admin to assign to different org, they must switch org first using OrgSwitcher
- Form follows existing pattern: section comments, glass cards, consistent input styling
- No API changes needed — forms now send visibility, API already handles it
