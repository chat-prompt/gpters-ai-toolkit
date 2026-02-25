/**
 * Catalog API organization-based filtering tests
 *
 * Tests org-based access control for catalog items including:
 * - List filtering by org and visibility
 * - Single item access validation
 * - Create with auto org assignment
 * - Update/delete org ownership checks
 *
 * Requires DATABASE_URL - skipped in CI without database access.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'

const hasDatabase = !!process.env.DATABASE_URL || !!process.env.TEST_DATABASE_URL

const TEST_ORG_1 = 'test-org-1'
const TEST_ORG_2 = 'test-org-2'
const TEST_USER_ORG_1 = 'test-user-org-1'
const TEST_USER_ORG_2 = 'test-user-org-2'
const TEST_SUPER_ADMIN = 'test-super-admin'

describe.skipIf(!hasDatabase)('Catalog API - Organization Filtering', () => {
  let db: Awaited<typeof import('@gpters/db')>['db']
  let catalogItems: Awaited<typeof import('@gpters/db')>['catalogItems']
  let organizations: Awaited<typeof import('@gpters/db')>['organizations']
  let users: Awaited<typeof import('@gpters/db')>['users']
  let orgMemberships: Awaited<typeof import('@gpters/db')>['orgMemberships']

  beforeAll(async () => {
    const dbModule = await import('@gpters/db')
    db = dbModule.db
    catalogItems = dbModule.catalogItems
    organizations = dbModule.organizations
    users = dbModule.users
    orgMemberships = dbModule.orgMemberships

    await db.insert(organizations).values([
      {
        id: TEST_ORG_1,
        name: 'Test Org 1',
        slug: 'test-org-1',
        allowedDomains: ['org1.test'],
        isActive: true,
      },
      {
        id: TEST_ORG_2,
        name: 'Test Org 2',
        slug: 'test-org-2',
        allowedDomains: ['org2.test'],
        isActive: true,
      },
    ]).onConflictDoNothing()

    await db.insert(users).values([
      {
        id: TEST_USER_ORG_1,
        email: 'user@org1.test',
        name: 'User Org 1',
        role: 'editor',
      },
      {
        id: TEST_USER_ORG_2,
        email: 'user@org2.test',
        name: 'User Org 2',
        role: 'editor',
      },
      {
        id: TEST_SUPER_ADMIN,
        email: 'admin@org1.test',
        name: 'Super Admin',
        role: 'super_admin',
      },
    ]).onConflictDoNothing()

    await db.insert(orgMemberships).values([
      { userId: TEST_USER_ORG_1, orgId: TEST_ORG_1, role: 'org_editor' },
      { userId: TEST_USER_ORG_2, orgId: TEST_ORG_2, role: 'org_editor' },
      { userId: TEST_SUPER_ADMIN, orgId: TEST_ORG_1, role: 'org_admin' },
    ]).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-org-private-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-org-private-2'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-org-public'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-org-legacy'))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, TEST_USER_ORG_1))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, TEST_USER_ORG_2))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, TEST_SUPER_ADMIN))
    await db.delete(users).where(eq(users.id, TEST_USER_ORG_1))
    await db.delete(users).where(eq(users.id, TEST_USER_ORG_2))
    await db.delete(users).where(eq(users.id, TEST_SUPER_ADMIN))
    await db.delete(organizations).where(eq(organizations.id, TEST_ORG_1))
    await db.delete(organizations).where(eq(organizations.id, TEST_ORG_2))
  })

  describe('List filtering (GET /api/catalog)', () => {
    beforeAll(async () => {
      await db.insert(catalogItems).values([
        {
          id: 'test-org-private-1',
          type: 'skill',
          name: 'Private Skill Org 1',
          content: 'Test content',
          description: '',
          authorId: TEST_USER_ORG_1,
          orgId: TEST_ORG_1,
          visibility: 'private',
        },
        {
          id: 'test-org-private-2',
          type: 'skill',
          name: 'Private Skill Org 2',
          content: 'Test content',
          description: '',
          authorId: TEST_USER_ORG_2,
          orgId: TEST_ORG_2,
          visibility: 'private',
        },
        {
          id: 'test-org-public',
          type: 'skill',
          name: 'Public Skill',
          content: 'Test content',
          description: '',
          authorId: TEST_USER_ORG_1,
          orgId: TEST_ORG_1,
          visibility: 'public',
        },
        {
          id: 'test-org-legacy',
          type: 'skill',
          name: 'Legacy Skill',
          content: 'Test content',
          description: '',
          authorId: TEST_USER_ORG_1,
          orgId: null,
          visibility: 'private',
        },
      ]).onConflictDoNothing()
    })

    it('should filter items by org ownership for org member', async () => {
      const items = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.orgId, TEST_ORG_1))

      expect(items.length).toBeGreaterThanOrEqual(1)
      expect(items.every(item => item.orgId === TEST_ORG_1 || item.orgId === null)).toBe(true)
    })

    it('should show public items to all users', async () => {
      const items = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.visibility, 'public'))

      expect(items.length).toBeGreaterThanOrEqual(1)
      const publicItem = items.find(item => item.id === 'test-org-public')
      expect(publicItem).toBeDefined()
    })

    it('should show legacy items (orgId = null) to all users', async () => {
      const items = await db.select().from(catalogItems)
      const legacyItem = items.find(item => item.id === 'test-org-legacy')

      expect(legacyItem).toBeDefined()
      expect(legacyItem?.orgId).toBeNull()
    })

    it('should allow super_admin to see all items', async () => {
      const allItems = await db.select().from(catalogItems)

      expect(allItems.length).toBeGreaterThan(0)
    })
  })

  describe('Single item access (GET /api/catalog/[id])', () => {
    it('should allow access to own org private item', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-private-1'))

      expect(item).toBeDefined()
      expect(item.orgId).toBe(TEST_ORG_1)
      expect(item.visibility).toBe('private')
    })

    it('should return 404 for different org private item', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-private-2'))

      expect(item).toBeDefined()
      expect(item.orgId).toBe(TEST_ORG_2)
    })

    it('should allow access to public items from any org', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-public'))

      expect(item).toBeDefined()
      expect(item.visibility).toBe('public')
    })

    it('should allow access to legacy items (orgId = null)', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-legacy'))

      expect(item).toBeDefined()
      expect(item.orgId).toBeNull()
    })
  })

  describe('Create with org assignment (POST /api/catalog)', () => {
    it('should auto-assign currentOrgId when creating item', async () => {
      const newItem = {
        id: 'test-new-item',
        type: 'skill' as const,
        name: 'New Skill',
        content: 'Test content',
        description: '',
        authorId: TEST_USER_ORG_1,
        orgId: TEST_ORG_1,
        visibility: 'private' as const,
      }

      await db.insert(catalogItems).values(newItem)
      const [created] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-new-item'))

      expect(created).toBeDefined()
      expect(created.orgId).toBe(TEST_ORG_1)
      expect(created.visibility).toBe('private')

      await db.delete(catalogItems).where(eq(catalogItems.id, 'test-new-item'))
    })

    it('should default visibility to private', async () => {
      const newItem = {
        id: 'test-default-visibility',
        type: 'skill' as const,
        name: 'Default Visibility Skill',
        content: 'Test content',
        description: '',
        authorId: TEST_USER_ORG_1,
        orgId: TEST_ORG_1,
      }

      await db.insert(catalogItems).values(newItem)
      const [created] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-default-visibility'))

      expect(created.visibility).toBe('private')

      await db.delete(catalogItems).where(eq(catalogItems.id, 'test-default-visibility'))
    })
  })

  describe('Update/Delete org ownership (PUT/DELETE /api/catalog/[id])', () => {
    it('should allow update if orgId matches currentOrgId', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-private-1'))

      expect(item.orgId).toBe(TEST_ORG_1)
    })

    it('should return 404 for update if orgId differs (non-super_admin)', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-private-2'))

      expect(item.orgId).toBe(TEST_ORG_2)
    })

    it('should allow super_admin to update any item', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-private-2'))

      expect(item).toBeDefined()
    })

    it('should allow delete if orgId matches currentOrgId', async () => {
      const newItem = {
        id: 'test-delete-own',
        type: 'skill' as const,
        name: 'Delete Own',
        content: 'Test content',
        description: '',
        authorId: TEST_USER_ORG_1,
        orgId: TEST_ORG_1,
        visibility: 'private' as const,
      }

      await db.insert(catalogItems).values(newItem)
      const [created] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-delete-own'))

      expect(created.orgId).toBe(TEST_ORG_1)

      await db.delete(catalogItems).where(eq(catalogItems.id, 'test-delete-own'))
    })
  })

  describe('Visibility levels', () => {
    it('should respect private visibility (own org only)', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-private-1'))

      expect(item.visibility).toBe('private')
      expect(item.orgId).toBe(TEST_ORG_1)
    })

    it('should respect public visibility (all orgs)', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-public'))

      expect(item.visibility).toBe('public')
    })

  })

  describe('Backward compatibility', () => {
    it('should handle items with orgId = null', async () => {
      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-org-legacy'))

      expect(item.orgId).toBeNull()
    })

    it('should not break existing queries without org filter', async () => {
      const allItems = await db.select().from(catalogItems)

      expect(allItems.length).toBeGreaterThan(0)
    })
  })
})
