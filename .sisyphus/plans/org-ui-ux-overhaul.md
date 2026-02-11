# Organization Multi-Tenancy UI/UX Overhaul

## TL;DR

> **Quick Summary**: Update all UI pages to reflect organization-based multi-tenancy — catalog filtering, org badges, admin forms, profile, and detail pages. Backend is ready; this is primarily frontend work.
> 
> **Deliverables**:
> - Catalog shows only accessible items (own org + public + shared + legacy)
> - OrgBadge + VisibilityBadge reusable components
> - ItemCard and detail pages show org/visibility info
> - Admin catalog forms with org selector + visibility selector
> - Admin catalog table with org column + filtering
> - Profile page with org membership section
> - Fork button on detail pages for cross-org items
> - Admin dashboard with org-scoped stats
> - Search endpoint security fix (org-based filtering)
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Tasks 3,4,5 (parallel) → Tasks 6,7 (parallel) → Task 8

---

## Context

### Original Request
User observed that organization-based multi-tenancy was added at the backend level (13 tasks, 14 commits, 48 files) but the UI doesn't reflect it — catalog shows all items globally, admin forms lack org fields, detail pages don't show org info, profile doesn't show org membership.

### Interview Summary
**Key Decisions**:
- **Scope**: Full UI overhaul — all pages must be org-aware
- **Catalog behavior**: Show only accessible items (own org + public + shared + legacy null), NOT everything
- **Admin create/edit**: Org selector dropdown (super_admin picks any org; regular users see current org only)

**Research Findings**:
- Design system uses dark-first glass morphism with CSS variables
- Badge pattern: `bg-[color]/20 text-[color] border border-[color]/30`
- DB schema already has `orgId`, `visibility`, `sharedWithOrgs` on `catalogItems`
- OrgSwitcher + `useOrgContext()` hook already working
- Admin org management pages already complete

### Metis Review
**Identified Gaps** (addressed):
- Search endpoint `/api/catalog/search` has NO org filtering → Added as Task 1 (security critical)
- Legacy items (`orgId = null`) display behavior → Default: show with "Legacy" badge
- Org switching while on detail page → Remain on page; next navigation reflects new org
- Empty org state → Show empty state with CTA to browse public items
- Fork destination → Always fork to current org with `visibility=private`

---

## Work Objectives

### Core Objective
Make every user-facing page org-aware: users should clearly see which org owns each item, only see items they're authorized to access, and manage items within their org context.

### Concrete Deliverables
- `OrgBadge` component (`apps/web/components/ui/OrgBadge.tsx`)
- `VisibilityBadge` component (`apps/web/components/ui/VisibilityBadge.tsx`)
- `ForkButton` component (`apps/web/components/detail/ForkButton.tsx`)
- Updated `ItemCard.tsx` with org/visibility badges
- Updated `ItemHero.tsx` with org info and fork button
- Updated `SearchableCatalog.tsx` with org filtering context
- Updated admin catalog page with org column and filter
- Updated admin catalog create/edit forms with org + visibility fields
- Updated profile page with org membership section
- Updated admin dashboard with org-scoped stats
- Fixed search endpoint with org-based filtering

### Definition of Done
- [x] `pnpm build` succeeds with zero TypeScript errors
- [x] Non-super-admin cannot see private items from other orgs in catalog
- [x] Non-super-admin cannot search for private items from other orgs
- [x] ItemCard displays org badge with org name
- [x] Detail pages show org name and visibility badge
- [x] Fork button appears on accessible cross-org items
- [x] Admin create form has org selector + visibility selector
- [x] Profile shows org memberships with roles
- [x] Admin dashboard stats are filtered by current org

### Must Have
- Catalog filters out inaccessible items
- Org badge on all item displays (card + detail)
- Visibility indicator (🔒 private, 👥 shared, 🌍 public)
- Org selector in admin forms
- Fork button on detail pages

### Must NOT Have (Guardrails)
- NO sharedWithOrgs user-facing editing UI (admin-only, defer to Phase 2)
- NO org creation/deletion changes (already built in `/admin/organizations`)
- NO member management changes (already built)
- NO invitation system changes
- NO MCP API behavior changes
- NO org branding (custom logos/colors)
- NO notification system for shared items
- NO "leave org" functionality on profile
- NO changes to backend catalog filtering logic (except search endpoint security fix)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks are verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (Vitest + Playwright)
- **Automated tests**: Tests-after (add tests for new components)
- **Framework**: Vitest for unit, Playwright for E2E

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Every task includes Playwright and/or curl scenarios. The executing agent directly verifies by running the app, navigating pages, and asserting DOM state.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Frontend component | Playwright | Navigate, snapshot DOM, assert elements exist |
| API fix | Bash (curl) | Send requests, assert response filtering |
| Admin form | Playwright | Navigate, fill form, submit, verify |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Fix search endpoint security (backend, independent)
└── Task 2: Create OrgBadge + VisibilityBadge components (no deps)

Wave 2 (After Wave 1):
├── Task 3: Update ItemCard + catalog page (depends: 2)
├── Task 4: Update admin catalog table + filters (depends: 2)
└── Task 5: Update admin catalog create/edit forms (independent of 3,4)

Wave 3 (After Wave 2):
├── Task 6: Update detail pages + ForkButton (depends: 2)
├── Task 7: Update profile page org membership (independent)
└── Task 8: Update admin dashboard org-scoped stats (independent)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | None | 2 |
| 2 | None | 3, 4, 6 | 1 |
| 3 | 2 | None | 4, 5 |
| 4 | 2 | None | 3, 5 |
| 5 | None | None | 3, 4 |
| 6 | 2 | None | 7, 8 |
| 7 | None | None | 6, 8 |
| 8 | None | None | 6, 7 |

---

## TODOs

- [x] 1. Fix search endpoint org-based filtering (SECURITY)

  **What to do**:
  - Audit `apps/web/app/api/catalog/search/route.ts` (or similar search endpoint)
  - Add the same org-based filtering logic used in `GET /api/catalog`:
    - Show items where `orgId = currentOrgId` (own org)
    - Show items where `visibility = 'public'`
    - Show items where `visibility = 'shared'` AND `sharedWithOrgs` contains `currentOrgId`
    - Show legacy items where `orgId IS NULL`
    - Super admins see everything
  - If no dedicated search endpoint exists, verify the main catalog GET endpoint handles `?query=` with org filtering

  **Must NOT do**:
  - Do not change the catalog GET endpoint's existing filtering logic (only search)
  - Do not add new API endpoints

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single API endpoint fix, well-defined pattern to follow
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit after fix

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/app/api/catalog/route.ts:36-65` — Existing org-based filtering logic in GET handler. Copy this pattern.

  **API/Type References**:
  - `packages/db/src/schema.ts:99-107` — `catalogItems.orgId`, `visibility`, `sharedWithOrgs` fields
  - `packages/lib/src/security/rbac.ts` — `isSuperAdmin()` function for role checking

  **WHY Each Reference Matters**:
  - `catalog/route.ts` has the exact SQL filtering pattern (org + visibility + shared + legacy) that must be replicated in search

  **Acceptance Criteria**:

  - [x] Search endpoint returns ONLY accessible items for non-super-admin users
  - [x] Super admin search returns all items
  - [x] Legacy items (orgId=null) appear in search results for all users

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Search filters by org context
    Tool: Bash (curl)
    Preconditions: Dev server running on localhost:3000, test user session available
    Steps:
      1. GET /api/catalog?query=test with session cookie for org-1 user
      2. Parse response JSON
      3. Assert: No items with orgId != "org-1" AND visibility = "private"
      4. Assert: Items with visibility = "public" appear regardless of orgId
      5. Assert: Legacy items (orgId = null) appear
    Expected Result: Only accessible items returned
    Evidence: Response body captured
  ```

  **Commit**: YES
  - Message: `fix(api): add org-based filtering to catalog search endpoint`
  - Files: `apps/web/app/api/catalog/route.ts` (or search route)

---

- [x] 2. Create OrgBadge and VisibilityBadge reusable components

  **What to do**:
  - Create `apps/web/components/ui/OrgBadge.tsx`:
    - Props: `orgName: string | null`, `orgSlug?: string`, `size?: 'sm' | 'md'`
    - If `orgName` is null → show "Legacy" badge (gray)
    - Otherwise → show org name with building icon (🏢)
    - Follow badge pattern: `bg-[color]/20 text-[color] border border-[color]/30 rounded-full`
    - Color: Use `--accent-cyan` for org badges (consistent with platform theme)
  - Create `apps/web/components/ui/VisibilityBadge.tsx`:
    - Props: `visibility: 'private' | 'shared' | 'public' | null`
    - `private` → 🔒 icon, gray styling
    - `shared` → 👥 icon, blue styling
    - `public` → 🌍 icon, green styling
    - `null` (legacy) → no badge
    - Same badge pattern as above
  - Both components should be tiny, self-contained, no API calls

  **Must NOT do**:
  - Do not use emoji in badge text (use as icon only, with text label)
  - Do not fetch org data — receive as props
  - Do not create complex state management

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Pure UI component creation following established design system
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Design system consistency, proper styling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/components/catalog/SearchableCatalog/ItemCard.tsx:109-117` — Existing badge styling pattern (Draft badge, CLI Ready badge)
  - `apps/web/components/ui/StatusBadge.tsx` — Existing reusable badge component pattern
  - `apps/web/components/layout/UserMenu.tsx:138-150` — Role badge pattern with color mapping

  **API/Type References**:
  - `packages/db/src/schema.ts:101` — `visibility` enum: `'private' | 'shared' | 'public'`

  **Design System References**:
  - `apps/web/app/globals.css` — CSS variables for colors (`--accent-cyan`, `--text-muted`, etc.)

  **WHY Each Reference Matters**:
  - `ItemCard.tsx` badge pattern must be exactly matched for visual consistency
  - `StatusBadge.tsx` shows how to structure a reusable badge component
  - `globals.css` provides the color variables to use

  **Acceptance Criteria**:

  - [x] `OrgBadge` renders org name with icon for valid orgName
  - [x] `OrgBadge` renders "Legacy" in gray for null orgName
  - [x] `VisibilityBadge` renders correct icon and color for each visibility type
  - [x] Both components match existing badge styling pattern exactly
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: OrgBadge renders correctly in Storybook-like isolation
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, component importable
    Steps:
      1. Create a temporary test page or use existing catalog page after Task 3
      2. Verify OrgBadge renders with org name text visible
      3. Verify VisibilityBadge renders with correct icons
      4. Screenshot both badge variants
    Expected Result: Badges match design system
    Evidence: .sisyphus/evidence/task-2-badges.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add OrgBadge and VisibilityBadge reusable components`
  - Files: `apps/web/components/ui/OrgBadge.tsx`, `apps/web/components/ui/VisibilityBadge.tsx`

---

- [x] 3. Update catalog page — org filtering context and ItemCard badges

  **What to do**:
  - **ItemCard** (`apps/web/components/catalog/SearchableCatalog/ItemCard.tsx`):
    - Add `OrgBadge` showing which org owns the item
    - Add `VisibilityBadge` for non-private items (or all items for admins)
    - Position: Below existing badges row (draft, CLI ready, version)
    - The catalog API already returns `orgId` and `visibility` fields — just display them
    - Need to resolve org name from org ID — either pass from parent or add org name to API response
  - **SearchableCatalog** (`apps/web/components/catalog/SearchableCatalog/SearchableCatalog.tsx`):
    - Add context indicator: "Showing items from [Org Name]" or "Showing all accessible items"
    - Update stats section (lines 300-344) to show org-scoped counts
    - The actual filtering happens server-side in the API; client just displays what's returned
  - **Home page** (`apps/web/app/page.tsx`):
    - Pass org context to catalog fetch if needed
    - Ensure `getCatalog()` call respects org context from session
  - **API response enhancement** (if needed):
    - If catalog API doesn't return org name, add a JOIN to include `organizations.name` in response
    - Check `apps/web/app/api/catalog/route.ts` to see what's returned

  **Must NOT do**:
  - Do not change backend filtering logic (API already filters correctly)
  - Do not add client-side filtering (trust server response)
  - Do not show visibility badge for own org's private items (redundant)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI updates to existing components following design patterns
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Design consistency and layout adjustments

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `apps/web/components/catalog/SearchableCatalog/ItemCard.tsx:31-123` — Full ItemCard component to add badges to
  - `apps/web/components/catalog/SearchableCatalog/SearchableCatalog.tsx:300-344` — Stats section to add org context
  - `apps/web/app/page.tsx:15-25` — Home page data fetching

  **API/Type References**:
  - `apps/web/app/api/catalog/route.ts:23-80` — Catalog GET handler, check what fields are returned
  - `packages/db/src/schema.ts:95-107` — catalogItems schema with orgId, visibility fields
  - `apps/web/lib/core/types.ts` — CatalogItem type definition (check if orgId is included)

  **Component References**:
  - `apps/web/components/ui/OrgBadge.tsx` — Created in Task 2
  - `apps/web/components/ui/VisibilityBadge.tsx` — Created in Task 2

  **WHY Each Reference Matters**:
  - `ItemCard.tsx` is the exact component to modify — need to understand its layout
  - `catalog/route.ts` tells us what data is available in the response
  - `types.ts` confirms the TypeScript types match

  **Acceptance Criteria**:

  - [x] ItemCard displays OrgBadge with organization name
  - [x] ItemCard displays VisibilityBadge for public/shared items
  - [x] Catalog page shows context text ("Showing items from [Org]")
  - [x] Stats section reflects items from current view (not global totals)
  - [x] Legacy items (orgId=null) show "Legacy" badge
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Catalog shows org badges on item cards
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in, items exist in current org
    Steps:
      1. Navigate to http://localhost:3000
      2. Wait for catalog items to load (timeout: 10s)
      3. Take accessibility snapshot
      4. Assert: At least one item card contains org name text
      5. Assert: Context indicator shows org name
      6. Screenshot: .sisyphus/evidence/task-3-catalog-badges.png
    Expected Result: Org badges visible on cards, context shown
    Evidence: .sisyphus/evidence/task-3-catalog-badges.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add org badges to catalog ItemCard and org context to catalog page`
  - Files: `apps/web/components/catalog/SearchableCatalog/ItemCard.tsx`, `apps/web/components/catalog/SearchableCatalog/SearchableCatalog.tsx`, `apps/web/app/page.tsx`

---

- [x] 4. Update admin catalog table — org column and filter

  **What to do**:
  - **Admin catalog page** (`apps/web/app/admin/catalog/page.tsx`):
    - Add "Organization" column to the catalog items table
    - Add org filter dropdown alongside existing type/team filters
    - Show org name in each row
    - Show visibility badge in each row
    - For super_admin: allow filtering by any org or "All"
    - For non-super-admin: only show current org's items (no filter needed)
  - Fetch org names for display (may need API enhancement or client-side org list)

  **Must NOT do**:
  - Do not change existing type/team filtering logic
  - Do not add bulk org reassignment functionality
  - Do not add inline editing for org field

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Admin table UI update with new columns and filters
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `apps/web/app/admin/catalog/page.tsx:59-300+` — Full admin catalog page with table, filters, stats
  - `apps/web/app/admin/catalog/page.tsx:156-179` — Existing team tag filter pattern to replicate for org filter

  **Component References**:
  - `apps/web/components/ui/OrgBadge.tsx` — From Task 2
  - `apps/web/components/ui/VisibilityBadge.tsx` — From Task 2

  **WHY Each Reference Matters**:
  - Admin catalog page structure shows exactly where to add the org column and filter

  **Acceptance Criteria**:

  - [x] Admin catalog table has "Organization" column showing org name
  - [x] Admin catalog table has "Visibility" column
  - [x] Super_admin can filter by organization via dropdown
  - [x] Non-super-admin sees only current org's items
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Admin catalog shows org column
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, logged in as super_admin, DEV_BYPASS_AUTH or real session
    Steps:
      1. Navigate to http://localhost:3000/admin/catalog
      2. Wait for table to load
      3. Assert: Table header contains "Organization" text
      4. Assert: Table rows contain org name values
      5. Assert: Org filter dropdown exists
      6. Screenshot: .sisyphus/evidence/task-4-admin-catalog.png
    Expected Result: Org column and filter visible in admin catalog
    Evidence: .sisyphus/evidence/task-4-admin-catalog.png
  ```

  **Commit**: YES
  - Message: `feat(admin): add org column and filter to catalog management page`
  - Files: `apps/web/app/admin/catalog/page.tsx`

---

- [x] 5. Update admin catalog create/edit forms — org and visibility selectors

  **What to do**:
  - **Create form** (`apps/web/app/admin/catalog/new/page.tsx`):
    - Add "Organization" dropdown selector:
      - Super_admin: shows all orgs
      - Non-super-admin: shows only current org (disabled/pre-selected)
    - Add "Visibility" selector (radio buttons or dropdown):
      - Private (default), Shared, Public
    - Fetch org list from `/api/organizations`
    - Include `orgId` and `visibility` in form submission payload
  - **Edit form** (find edit page, likely `apps/web/app/admin/catalog/[id]/edit/page.tsx`):
    - Same org + visibility selectors
    - Pre-fill with current values
    - Super_admin can change org; others cannot
  - **API check**: Verify POST/PATCH `/api/catalog` accepts `orgId` and `visibility` in body

  **Must NOT do**:
  - Do not add `sharedWithOrgs` multi-select (Phase 2)
  - Do not allow org change for non-super-admin users
  - Do not create new API endpoints

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form UI with selectors following existing patterns
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: None
  - **Blocked By**: None (doesn't depend on OrgBadge)

  **References**:

  **Pattern References**:
  - `apps/web/app/admin/catalog/new/page.tsx` — Existing create form with all current fields
  - `apps/web/app/admin/organizations/new/page.tsx` — Org create form for form pattern reference
  - `apps/web/components/layout/OrgSwitcher.tsx:45-90` — Org dropdown fetch and display pattern

  **API/Type References**:
  - `apps/web/app/api/catalog/route.ts` — POST handler, check if it accepts orgId/visibility
  - `packages/db/src/schema.ts:95-107` — Schema for orgId, visibility fields and allowed values

  **WHY Each Reference Matters**:
  - `catalog/new` is the exact form to modify
  - `OrgSwitcher.tsx` shows the pattern for fetching and displaying org list
  - POST handler must be checked/updated to accept new fields

  **Acceptance Criteria**:

  - [x] Create form has "Organization" dropdown
  - [x] Create form has "Visibility" selector (private/shared/public)
  - [x] Super_admin can select any org; others see only current org
  - [x] Submitting form creates item with correct orgId and visibility
  - [x] Edit form pre-fills org and visibility from existing item
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Admin create form has org and visibility selectors
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, logged in as admin
    Steps:
      1. Navigate to http://localhost:3000/admin/catalog/new
      2. Wait for form to load
      3. Assert: "Organization" selector/dropdown exists
      4. Assert: "Visibility" selector exists with options private/shared/public
      5. Fill form with test data, select org, select visibility=public
      6. Submit form
      7. Navigate to /admin/catalog and verify new item shows correct org and visibility
      8. Screenshot: .sisyphus/evidence/task-5-admin-form.png
    Expected Result: Form has org and visibility fields, submission works
    Evidence: .sisyphus/evidence/task-5-admin-form.png
  ```

  **Commit**: YES
  - Message: `feat(admin): add org selector and visibility selector to catalog forms`
  - Files: `apps/web/app/admin/catalog/new/page.tsx`, `apps/web/app/admin/catalog/[id]/edit/page.tsx` (if exists)

---

- [x] 6. Update detail pages — org info and ForkButton

  **What to do**:
  - **ItemHero** (`apps/web/components/detail/ItemHero.tsx`):
    - Add OrgBadge showing which org owns the item
    - Add VisibilityBadge next to org badge
    - Position: In the metadata row alongside author, version, etc.
  - **ForkButton** (new component `apps/web/components/detail/ForkButton.tsx`):
    - Shows "Fork to [My Org]" button
    - Only appears when viewing items from OTHER orgs (not own org)
    - Also appears for legacy items (orgId=null)
    - On click: POST to `/api/catalog/[id]/fork`
    - Loading state, success toast, redirect to new forked item
  - **Detail page files** (skill/agent/command/guide/hook `[id]/page.tsx`):
    - Pass org info to ItemHero
    - Add ForkButton with proper conditions
    - Resolve org name from orgId for display (may need API enhancement)

  **Must NOT do**:
  - Do not add fork analytics or tracking
  - Do not add "share with org" button (Phase 2)
  - Do not modify fork API logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation and detail page updates
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `apps/web/components/detail/ItemHero.tsx:74-153` — Hero section layout to add org info to
  - `apps/web/app/skill/[id]/page.tsx:50-95` — Skill detail page data fetching and rendering
  - `apps/web/components/detail/DetailPageLayout.tsx` — Overall detail page structure

  **API/Type References**:
  - `apps/web/app/api/catalog/[id]/fork/route.ts:37-120` — Fork API handler (already complete)

  **Component References**:
  - `apps/web/components/ui/OrgBadge.tsx` — From Task 2
  - `apps/web/components/ui/VisibilityBadge.tsx` — From Task 2
  - `apps/web/components/ui/Toast.tsx` — For fork success/error notifications

  **WHY Each Reference Matters**:
  - `ItemHero.tsx` is exactly where org info goes
  - Fork API is already built; ForkButton just calls it
  - Toast component provides the notification pattern for fork feedback

  **Acceptance Criteria**:

  - [x] Detail pages show OrgBadge with org name
  - [x] Detail pages show VisibilityBadge
  - [x] ForkButton appears on items from other orgs
  - [x] ForkButton does NOT appear on own org items
  - [x] Clicking Fork creates copy in current org and shows success toast
  - [x] All 5 detail page types (skill, agent, command, guide, hook) updated
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Detail page shows org info and fork button
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, logged in, public item from other org exists
    Steps:
      1. Navigate to detail page of a public item from another org
      2. Assert: OrgBadge visible with org name
      3. Assert: VisibilityBadge visible showing "Public"
      4. Assert: Fork button visible with text "Fork to [My Org]"
      5. Screenshot: .sisyphus/evidence/task-6-detail-fork.png
    Expected Result: Org info and fork button visible
    Evidence: .sisyphus/evidence/task-6-detail-fork.png

  Scenario: Fork button hidden on own org items
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, logged in, item from own org exists
    Steps:
      1. Navigate to detail page of own org item
      2. Assert: OrgBadge shows current org name
      3. Assert: Fork button is NOT visible
    Expected Result: No fork button on own items
  ```

  **Commit**: YES
  - Message: `feat(ui): add org info and fork button to detail pages`
  - Files: `apps/web/components/detail/ItemHero.tsx`, `apps/web/components/detail/ForkButton.tsx`, `apps/web/app/skill/[id]/page.tsx`, `apps/web/app/agent/[id]/page.tsx`, `apps/web/app/command/[id]/page.tsx`, `apps/web/app/guide/[id]/page.tsx`, `apps/web/app/hook/[id]/page.tsx`

---

- [x] 7. Update profile page — org membership section

  **What to do**:
  - **Profile page** (`apps/web/app/profile/page.tsx`):
    - Add "Organizations" section between user info and stats
    - Show list of orgs the user belongs to
    - For each org: name, slug, user's role in that org (org_admin/org_editor/org_viewer), join date
    - Show "Current" indicator for active org
    - Add "Switch to" button/link for non-current orgs (uses `switchOrg` from `useOrgContext`)
    - Show org-specific stats: "X items in this org"
  - Fetch org membership data:
    - May need a new section in existing profile data fetch
    - Or use `/api/organizations` response + session org data
  - Follow existing profile page card styling (glass morphism cards)

  **Must NOT do**:
  - Do not add "Leave org" button (complex, Phase 2)
  - Do not add org settings editing on profile
  - Do not add invitation management on profile

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: New UI section on existing page following established patterns
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/app/profile/page.tsx:66-281` — Full profile page structure and card styling
  - `apps/web/components/layout/OrgSwitcher.tsx:45-60` — Org data fetch pattern
  - `apps/web/lib/hooks/useOrgContext.ts:45-66` — `switchOrg` function

  **API/Type References**:
  - `apps/web/app/api/organizations/route.ts` — GET returns org list with member counts
  - `packages/db/src/schema.ts` — `orgMemberships` table with `role` field

  **WHY Each Reference Matters**:
  - `profile/page.tsx` is the exact file to modify — need to match card styling
  - `useOrgContext` provides the `switchOrg` function for "Switch to" buttons

  **Acceptance Criteria**:

  - [x] Profile page has "Organizations" section
  - [x] Section shows all user's org memberships with name and role
  - [x] Current org is marked with indicator
  - [x] "Switch to" action works for non-current orgs
  - [x] Styling matches existing profile page card pattern
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Profile shows org membership section
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, logged in, user belongs to at least 1 org
    Steps:
      1. Navigate to http://localhost:3000/profile
      2. Wait for page to load
      3. Assert: "Organizations" heading visible
      4. Assert: At least one org card with org name
      5. Assert: Org role badge visible (e.g., "org_admin")
      6. Assert: Current org has "Current" indicator
      7. Screenshot: .sisyphus/evidence/task-7-profile-orgs.png
    Expected Result: Org membership section visible with correct data
    Evidence: .sisyphus/evidence/task-7-profile-orgs.png
  ```

  **Commit**: YES
  - Message: `feat(profile): add organization membership section`
  - Files: `apps/web/app/profile/page.tsx`

---

- [x] 8. Update admin dashboard — org-scoped stats

  **What to do**:
  - **Admin dashboard** (`apps/web/app/admin/page.tsx`):
    - Add org context indicator at top: "Viewing stats for [Org Name]" or "All Organizations" (for super_admin)
    - Filter stats by current org:
      - Total items → Items in current org
      - Published/Draft counts → Per current org
      - Recent activity → From current org
      - Popular items → Within current org
    - For super_admin: add toggle to view "All Orgs" vs "Current Org"
    - Update the stats fetch queries to accept orgId parameter
  - May need API adjustments to pass orgId filter to stats queries

  **Must NOT do**:
  - Do not add per-org comparison charts
  - Do not add org analytics or trends
  - Do not restructure the dashboard layout

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Data display updates, straightforward query filtering
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/app/admin/page.tsx:101-476` — Full admin dashboard with stats, activity, drafts, popular items
  - `apps/web/app/admin/page.tsx:157-169` — Stats cards to add org filtering to

  **API/Type References**:
  - `apps/web/lib/hooks/useOrgContext.ts` — For getting current org ID in client component

  **WHY Each Reference Matters**:
  - `admin/page.tsx` is the file to modify — need to understand all data fetching points

  **Acceptance Criteria**:

  - [x] Dashboard shows "Viewing: [Org Name]" context indicator
  - [x] Stats reflect items from current org (not global)
  - [x] Super_admin has "All Organizations" toggle option
  - [x] Recent activity filtered by current org
  - [x] `pnpm build` succeeds

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Admin dashboard shows org-scoped stats
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, logged in as admin
    Steps:
      1. Navigate to http://localhost:3000/admin
      2. Wait for dashboard to load
      3. Assert: Org context indicator visible with org name
      4. Assert: Stats cards show numbers (not NaN or undefined)
      5. Screenshot: .sisyphus/evidence/task-8-admin-dashboard.png
    Expected Result: Dashboard shows org-scoped stats
    Evidence: .sisyphus/evidence/task-8-admin-dashboard.png
  ```

  **Commit**: YES
  - Message: `feat(admin): add org-scoped stats to admin dashboard`
  - Files: `apps/web/app/admin/page.tsx`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 1 | `fix(api): add org-based filtering to catalog search` | route.ts | `pnpm build` |
| 2 | `feat(ui): add OrgBadge and VisibilityBadge components` | OrgBadge.tsx, VisibilityBadge.tsx | `pnpm build` |
| 3 | `feat(ui): add org badges to catalog ItemCard and context` | ItemCard.tsx, SearchableCatalog.tsx | `pnpm build` |
| 4 | `feat(admin): add org column and filter to catalog page` | admin/catalog/page.tsx | `pnpm build` |
| 5 | `feat(admin): add org and visibility selectors to forms` | admin/catalog/new, edit | `pnpm build` |
| 6 | `feat(ui): add org info and fork button to detail pages` | ItemHero.tsx, ForkButton.tsx, 5x page.tsx | `pnpm build` |
| 7 | `feat(profile): add org membership section` | profile/page.tsx | `pnpm build` |
| 8 | `feat(admin): add org-scoped stats to dashboard` | admin/page.tsx | `pnpm build` |

---

## Success Criteria

### Verification Commands
```bash
pnpm build    # Expected: Build succeeds with zero errors
pnpm lint     # Expected: No new lint errors
```

### Final Checklist
- [x] All "Must Have" items present (org badges, filtering, forms, fork, profile)
- [x] All "Must NOT Have" items absent (no sharing UI, no org management changes, no MCP changes)
- [x] Build passes
- [x] Non-super-admin cannot see/search private items from other orgs
- [x] Super admin can manage items across all orgs
- [x] All 8 commits pushed to `feat/org-based-multi-tenancy` branch
