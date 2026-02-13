/**
 * MCP Organization-Based Access Control Tests
 *
 * Requires DATABASE_URL - skipped in CI without database access.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'

const hasDatabase = !!process.env.DATABASE_URL || !!process.env.TEST_DATABASE_URL

describe.skipIf(!hasDatabase)('MCP Organization Access Control', () => {
  const testOrgId1 = 'test-org-1'
  const testOrgId2 = 'test-org-2'
  const testUserId1 = 'test-user-1'
  const testUserId2 = 'test-user-2'
  const superAdminId = 'super-admin-1'

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
      { id: testOrgId1, name: 'Test Org 1', slug: 'test-org-1', allowedDomains: [] },
      { id: testOrgId2, name: 'Test Org 2', slug: 'test-org-2', allowedDomains: [] },
    ])

    await db.insert(users).values([
      { id: testUserId1, email: 'user1@test.com', role: 'viewer' },
      { id: testUserId2, email: 'user2@test.com', role: 'viewer' },
      { id: superAdminId, email: 'admin@test.com', role: 'super_admin' },
    ])

    await db.insert(orgMemberships).values([
      { userId: testUserId1, orgId: testOrgId1, role: 'org_editor' },
      { userId: testUserId2, orgId: testOrgId2, role: 'org_editor' },
    ])
  })

  afterAll(async () => {
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-private-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-private-2'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-public-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-shared-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-legacy-1'))

    await db.delete(orgMemberships).where(eq(orgMemberships.userId, testUserId1))
    await db.delete(orgMemberships).where(eq(orgMemberships.userId, testUserId2))

    await db.delete(users).where(eq(users.id, testUserId1))
    await db.delete(users).where(eq(users.id, testUserId2))
    await db.delete(users).where(eq(users.id, superAdminId))

    await db.delete(organizations).where(eq(organizations.id, testOrgId1))
    await db.delete(organizations).where(eq(organizations.id, testOrgId2))
  })

  beforeEach(async () => {
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-private-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-private-2'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-public-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-shared-1'))
    await db.delete(catalogItems).where(eq(catalogItems.id, 'test-legacy-1'))
  })

  describe('searchPlugins', () => {
    it('should filter private items by organization', async () => {
      await db.insert(catalogItems).values([
        {
          id: 'test-private-1',
          type: 'skill',
          name: 'Private Skill Org 1',
          description: 'Private to org 1',
          content: 'test',
          mcpEnabled: true,
          orgId: testOrgId1,
          visibility: 'private',
          sharedWithOrgs: [],
        },
        {
          id: 'test-private-2',
          type: 'skill',
          name: 'Private Skill Org 2',
          description: 'Private to org 2',
          content: 'test',
          mcpEnabled: true,
          orgId: testOrgId2,
          visibility: 'private',
          sharedWithOrgs: [],
        },
      ])

      const { searchPlugins } = await import('@gpters/lib/mcp')

      const resultOrg1 = await searchPlugins(
        { query: 'Skill', limit: 10 },
        testUserId1,
        'viewer',
        testOrgId1
      )

      expect(resultOrg1.plugins.some((p) => p.id === 'test-private-1')).toBe(true)
      expect(resultOrg1.plugins.some((p) => p.id === 'test-private-2')).toBe(false)
    })

    it('should show public items to all users', async () => {
      await db.insert(catalogItems).values({
        id: 'test-public-1',
        type: 'skill',
        name: 'Public Skill',
        description: 'Public to all',
        content: 'test',
        mcpEnabled: true,
        orgId: testOrgId1,
        visibility: 'public',
        sharedWithOrgs: [],
      })

      const { searchPlugins } = await import('@gpters/lib/mcp')

      const resultOrg2 = await searchPlugins(
        { query: 'Skill', limit: 10 },
        testUserId2,
        'viewer',
        testOrgId2
      )

      expect(resultOrg2.plugins.some((p) => p.id === 'test-public-1')).toBe(true)
    })

    it('should show shared items to allowed organizations', async () => {
      await db.insert(catalogItems).values({
        id: 'test-shared-1',
        type: 'skill',
        name: 'Shared Skill',
        description: 'Shared with org 2',
        content: 'test',
        mcpEnabled: true,
        orgId: testOrgId1,
        visibility: 'shared',
        sharedWithOrgs: [testOrgId2],
      })

      const { searchPlugins } = await import('@gpters/lib/mcp')

      const resultOrg2 = await searchPlugins(
        { query: 'Skill', limit: 10 },
        testUserId2,
        'viewer',
        testOrgId2
      )

      expect(resultOrg2.plugins.some((p) => p.id === 'test-shared-1')).toBe(true)
    })

    it('should show legacy items (orgId=null) to all users', async () => {
      await db.insert(catalogItems).values({
        id: 'test-legacy-1',
        type: 'skill',
        name: 'Legacy Skill',
        description: 'Legacy item',
        content: 'test',
        mcpEnabled: true,
        orgId: null,
        visibility: 'public',
        sharedWithOrgs: [],
      })

      const { searchPlugins } = await import('@gpters/lib/mcp')

      const result = await searchPlugins(
        { query: 'Skill', limit: 10 },
        testUserId1,
        'viewer',
        testOrgId1
      )

      expect(result.plugins.some((p) => p.id === 'test-legacy-1')).toBe(true)
    })

    it('should show all items to super_admin', async () => {
      await db.insert(catalogItems).values([
        {
          id: 'test-private-1',
          type: 'skill',
          name: 'Private Skill Org 1',
          description: 'Private to org 1',
          content: 'test',
          mcpEnabled: true,
          orgId: testOrgId1,
          visibility: 'private',
          sharedWithOrgs: [],
        },
        {
          id: 'test-private-2',
          type: 'skill',
          name: 'Private Skill Org 2',
          description: 'Private to org 2',
          content: 'test',
          mcpEnabled: true,
          orgId: testOrgId2,
          visibility: 'private',
          sharedWithOrgs: [],
        },
      ])

      const { searchPlugins } = await import('@gpters/lib/mcp')

      const result = await searchPlugins(
        { query: 'Skill', limit: 10 },
        superAdminId,
        'super_admin',
        testOrgId1
      )

      expect(result.plugins.some((p) => p.id === 'test-private-1')).toBe(true)
      expect(result.plugins.some((p) => p.id === 'test-private-2')).toBe(true)
    })

    it('should show only public items to unauthenticated users', async () => {
      await db.insert(catalogItems).values([
        {
          id: 'test-private-1',
          type: 'skill',
          name: 'Private Skill',
          description: 'Private',
          content: 'test',
          mcpEnabled: true,
          orgId: testOrgId1,
          visibility: 'private',
          sharedWithOrgs: [],
        },
        {
          id: 'test-public-1',
          type: 'skill',
          name: 'Public Skill',
          description: 'Public',
          content: 'test',
          mcpEnabled: true,
          orgId: testOrgId1,
          visibility: 'public',
          sharedWithOrgs: [],
        },
      ])

      const { searchPlugins } = await import('@gpters/lib/mcp')

      const result = await searchPlugins({ query: 'Skill', limit: 10 })

      expect(result.plugins.some((p) => p.id === 'test-private-1')).toBe(false)
      expect(result.plugins.some((p) => p.id === 'test-public-1')).toBe(true)
    })
  })

  describe('getPluginContent', () => {
    it('should deny access to private items from other orgs', async () => {
      await db.insert(catalogItems).values({
        id: 'test-private-1',
        type: 'skill',
        name: 'Private Skill',
        description: 'Private to org 1',
        content: 'test',
        mcpEnabled: true,
        orgId: testOrgId1,
        visibility: 'private',
        sharedWithOrgs: [],
      })

      const { getPluginContent } = await import('@/lib/mcp/handlers')

      const result = await getPluginContent(
        { pluginId: 'test-private-1' },
        testUserId2,
        'viewer',
        testOrgId2
      )

      expect(result).toBeNull()
    })

    it('should allow access to public items', async () => {
      await db.insert(catalogItems).values({
        id: 'test-public-1',
        type: 'skill',
        name: 'Public Skill',
        description: 'Public',
        content: 'test content',
        mcpEnabled: true,
        orgId: testOrgId1,
        visibility: 'public',
        sharedWithOrgs: [],
      })

      const { getPluginContent } = await import('@/lib/mcp/handlers')

      const result = await getPluginContent(
        { pluginId: 'test-public-1' },
        testUserId2,
        'viewer',
        testOrgId2
      )

      expect(result).not.toBeNull()
      expect(result?.id).toBe('test-public-1')
    })

    it('should allow access to shared items for allowed orgs', async () => {
      await db.insert(catalogItems).values({
        id: 'test-shared-1',
        type: 'skill',
        name: 'Shared Skill',
        description: 'Shared with org 2',
        content: 'test content',
        mcpEnabled: true,
        orgId: testOrgId1,
        visibility: 'shared',
        sharedWithOrgs: [testOrgId2],
      })

      const { getPluginContent } = await import('@/lib/mcp/handlers')

      const result = await getPluginContent(
        { pluginId: 'test-shared-1' },
        testUserId2,
        'viewer',
        testOrgId2
      )

      expect(result).not.toBeNull()
      expect(result?.id).toBe('test-shared-1')
    })

    it('should allow super_admin to access all items', async () => {
      await db.insert(catalogItems).values({
        id: 'test-private-1',
        type: 'skill',
        name: 'Private Skill',
        description: 'Private to org 1',
        content: 'test content',
        mcpEnabled: true,
        orgId: testOrgId1,
        visibility: 'private',
        sharedWithOrgs: [],
      })

      const { getPluginContent } = await import('@/lib/mcp/handlers')

      const result = await getPluginContent(
        { pluginId: 'test-private-1' },
        superAdminId,
        'super_admin',
        testOrgId2
      )

      expect(result).not.toBeNull()
      expect(result?.id).toBe('test-private-1')
    })
  })

  describe('deploySkill', () => {
    it('should set orgId when deploying new skill', async () => {
      const { deploySkill } = await import('@gpters/lib/mcp')

      const result = await deploySkill(
        {
          type: 'skill',
          name: 'Test Deploy Skill',
          content: 'test content',
          description: 'test',
        },
        testUserId1,
        'viewer',
        testOrgId1
      )

      expect(result.success).toBe(true)

      const [deployed] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, result.id))
        .limit(1)

      expect(deployed.orgId).toBe(testOrgId1)
      expect(deployed.visibility).toBe('private')

      await db.delete(catalogItems).where(eq(catalogItems.id, result.id))
    })
  })
})
