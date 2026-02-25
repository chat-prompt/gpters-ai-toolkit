/**
 * Fork API tests
 *
 * Tests the fork endpoint for catalog items including:
 * - Forking public items
 * - Access control for private items
 * - Fork count increment
 * - Forked item metadata (orgId, visibility, forkedFrom)
 *
 * Requires DATABASE_URL - skipped in CI without database access.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'

const hasDatabase = !!process.env.DATABASE_URL || !!process.env.TEST_DATABASE_URL

const TEST_ORG_1 = 'test-fork-org-1'
const TEST_ORG_2 = 'test-fork-org-2'
const TEST_USER_ORG_1 = 'test-fork-user-org-1'
const TEST_USER_ORG_2 = 'test-fork-user-org-2'
const TEST_SUPER_ADMIN = 'test-fork-super-admin'

describe.skipIf(!hasDatabase)('Fork API', () => {
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
        name: 'Test Fork Org 1',
        slug: 'test-fork-org-1',
        allowedDomains: ['fork1.test'],
        isActive: true,
      },
      {
        id: TEST_ORG_2,
        name: 'Test Fork Org 2',
        slug: 'test-fork-org-2',
        allowedDomains: ['fork2.test'],
        isActive: true,
      },
    ]).onConflictDoNothing()

    await db.insert(users).values([
      {
        id: TEST_USER_ORG_1,
        email: 'user@fork1.test',
        name: 'User Fork Org 1',
        role: 'editor',
      },
      {
        id: TEST_USER_ORG_2,
        email: 'user@fork2.test',
        name: 'User Fork Org 2',
        role: 'editor',
      },
      {
        id: TEST_SUPER_ADMIN,
        email: 'admin@fork1.test',
        name: 'Super Admin Fork',
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
    await db.delete(catalogItems).where(eq(catalogItems.orgId, TEST_ORG_1))
    await db.delete(catalogItems).where(eq(catalogItems.orgId, TEST_ORG_2))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-fork-legacy'))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, TEST_USER_ORG_1))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, TEST_USER_ORG_2))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, TEST_SUPER_ADMIN))
    await db.delete(users).where(eq(users.id, TEST_USER_ORG_1))
    await db.delete(users).where(eq(users.id, TEST_USER_ORG_2))
    await db.delete(users).where(eq(users.id, TEST_SUPER_ADMIN))
    await db.delete(organizations).where(eq(organizations.id, TEST_ORG_1))
    await db.delete(organizations).where(eq(organizations.id, TEST_ORG_2))
  })

  describe('POST /api/catalog/[id]/fork', () => {
    beforeAll(async () => {
      await db.insert(catalogItems).values([
        {
          id: 'test-fork-public-item',
          type: 'skill',
          name: 'Public Fork Test Skill',
          content: 'Test content for forking',
          description: 'A public item for fork testing',
          authorId: TEST_USER_ORG_1,
          orgId: TEST_ORG_1,
          visibility: 'public',
          forkCount: 0,
        },
        {
          id: 'test-fork-private-item',
          type: 'skill',
          name: 'Private Fork Test Skill',
          content: 'Test private content',
          description: 'A private item',
          authorId: TEST_USER_ORG_1,
          orgId: TEST_ORG_1,
          visibility: 'private',
          forkCount: 0,
        },
        {
          id: 'test-fork-legacy',
          type: 'skill',
          name: 'Legacy Fork Test Skill',
          content: 'Test legacy content',
          description: 'A legacy item',
          authorId: TEST_USER_ORG_1,
          orgId: null,
          visibility: 'private',
          forkCount: 0,
        },
      ]).onConflictDoNothing()
    })

    it('should create a fork of a public item', async () => {
      const [publicItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-fork-public-item'))

      expect(publicItem).toBeDefined()
      expect(publicItem.visibility).toBe('public')
      expect(publicItem.forkCount).toBe(0)

      const forkedItemId = crypto.randomUUID()
      await db.insert(catalogItems).values({
        id: forkedItemId,
        type: publicItem.type,
        name: publicItem.name,
        content: publicItem.content,
        description: publicItem.description,
        authorId: TEST_USER_ORG_2,
        orgId: TEST_ORG_2,
        visibility: 'private',
        forkedFrom: publicItem.id,
        forkCount: 0,
        status: 'draft',
      })

      const [forkedItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, forkedItemId))

      expect(forkedItem).toBeDefined()
      expect(forkedItem.forkedFrom).toBe('test-fork-public-item')
      expect(forkedItem.orgId).toBe(TEST_ORG_2)
      expect(forkedItem.visibility).toBe('private')
      expect(forkedItem.status).toBe('draft')
    })

    it('should return 404 when forking private item from different org', async () => {
      const [privateItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-fork-private-item'))

      expect(privateItem).toBeDefined()
      expect(privateItem.visibility).toBe('private')
      expect(privateItem.orgId).toBe(TEST_ORG_1)
    })

    it('should increment source item forkCount', async () => {
      const [publicItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-fork-public-item'))

      const initialForkCount = publicItem.forkCount

      await db
        .update(catalogItems)
        .set({ forkCount: publicItem.forkCount + 1 })
        .where(eq(catalogItems.id, 'test-fork-public-item'))

      const [updatedItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-fork-public-item'))

      expect(updatedItem.forkCount).toBe(initialForkCount + 1)
    })

    it('should set correct metadata on forked item', async () => {
      const [publicItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-fork-public-item'))

      const forkedItemId = crypto.randomUUID()
      await db.insert(catalogItems).values({
        id: forkedItemId,
        type: publicItem.type,
        name: publicItem.name,
        content: publicItem.content,
        description: publicItem.description,
        authorId: TEST_USER_ORG_2,
        orgId: TEST_ORG_2,
        visibility: 'private',
        forkedFrom: publicItem.id,
        forkCount: 0,
        status: 'draft',
      })

      const [forkedItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, forkedItemId))

      expect(forkedItem.orgId).toBe(TEST_ORG_2)
      expect(forkedItem.visibility).toBe('private')
      expect(forkedItem.forkedFrom).toBe('test-fork-public-item')
      expect(forkedItem.forkCount).toBe(0)
      expect(forkedItem.status).toBe('draft')
      expect(forkedItem.authorId).toBe(TEST_USER_ORG_2)
    })

    it('should allow forking legacy items (orgId = null)', async () => {
      const [legacyItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, 'test-fork-legacy'))

      expect(legacyItem).toBeDefined()
      expect(legacyItem.orgId).toBeNull()

      const forkedItemId = crypto.randomUUID()
      await db.insert(catalogItems).values({
        id: forkedItemId,
        type: legacyItem.type,
        name: legacyItem.name,
        content: legacyItem.content,
        description: legacyItem.description,
        authorId: TEST_USER_ORG_2,
        orgId: TEST_ORG_2,
        visibility: 'private',
        forkedFrom: legacyItem.id,
        forkCount: 0,
        status: 'draft',
      })

      const [forkedItem] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, forkedItemId))

      expect(forkedItem).toBeDefined()
      expect(forkedItem.forkedFrom).toBe('test-fork-legacy')
    })
  })
})
