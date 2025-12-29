import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CatalogItem } from '@/lib/core/types'

// Helper to create a base catalog item
function createBaseCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    type: 'skill',
    description: 'A test item for unit testing',
    content: '# Test Content\n\nThis is test content.',
    author: 'Test Author',
    tags: ['test', 'example'],
    createdAt: new Date(),
    updatedAt: new Date(),
    marketplaceEnabled: true,
    marketplaceVersion: '1.0.0',
    ...overrides,
  } as CatalogItem
}

describe('GitHub Sync Module', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Module Import', () => {
    it('should export syncItemToGitHub function', async () => {
      const module = await import('@/lib/marketplace/github-sync')
      expect(typeof module.syncItemToGitHub).toBe('function')
    })

    it('should export deleteItemFromGitHub function', async () => {
      const module = await import('@/lib/marketplace/github-sync')
      expect(typeof module.deleteItemFromGitHub).toBe('function')
    })

    it('should export syncAllToGitHub function', async () => {
      const module = await import('@/lib/marketplace/github-sync')
      expect(typeof module.syncAllToGitHub).toBe('function')
    })

    it('should export updateMarketplaceJson function', async () => {
      const module = await import('@/lib/marketplace/github-sync')
      expect(typeof module.updateMarketplaceJson).toBe('function')
    })
  })

  describe('syncItemToGitHub', () => {
    it('should fail for guide type items when GH_TOKEN is missing', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const item = createBaseCatalogItem({ type: 'guide' })

      const result = await module.syncItemToGitHub(item)

      // getOctokit() is called before the guide check, so it fails first
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('GH_TOKEN')
    })

    it('should fail for marketplace-disabled items when GH_TOKEN is missing', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const item = createBaseCatalogItem({ marketplaceEnabled: false })

      const result = await module.syncItemToGitHub(item)

      // getOctokit() is called before the disabled check, so it fails first
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('GH_TOKEN')
    })

    it('should return error when GH_TOKEN is missing for enabled items', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const item = createBaseCatalogItem({
        type: 'skill',
        marketplaceEnabled: true,
      })

      const result = await module.syncItemToGitHub(item)

      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('GH_TOKEN')
    })

    it('should include syncedAt timestamp', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const item = createBaseCatalogItem({ type: 'guide' })

      const result = await module.syncItemToGitHub(item)

      expect(result.syncedAt).toBeInstanceOf(Date)
    })
  })

  describe('deleteItemFromGitHub', () => {
    it('should return error when GH_TOKEN is missing', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')

      const result = await module.deleteItemFromGitHub('some-id')

      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('GH_TOKEN')
    })

    it('should include proper result structure', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')

      const result = await module.deleteItemFromGitHub('test-id')

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('filesCreated')
      expect(result).toHaveProperty('filesUpdated')
      expect(result).toHaveProperty('filesDeleted')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('syncedAt')
    })
  })

  describe('syncAllToGitHub', () => {
    it('should return error when GH_TOKEN is missing', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const items = [createBaseCatalogItem()]

      const result = await module.syncAllToGitHub(items)

      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('GH_TOKEN')
    })

    it('should handle empty items array', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')

      const result = await module.syncAllToGitHub([])

      // Even with empty array, needs token to update marketplace.json
      expect(result.success).toBe(false)
    })

    it('should include proper result structure', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')

      const result = await module.syncAllToGitHub([])

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('filesCreated')
      expect(result).toHaveProperty('filesUpdated')
      expect(result).toHaveProperty('filesDeleted')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('syncedAt')
      expect(result.syncedAt).toBeInstanceOf(Date)
    })
  })

  describe('updateMarketplaceJson', () => {
    it('should return error when GH_TOKEN is missing', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')

      const result = await module.updateMarketplaceJson([])

      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('GH_TOKEN')
    })

    it('should include proper result structure', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')

      const result = await module.updateMarketplaceJson([createBaseCatalogItem()])

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('filesCreated')
      expect(result).toHaveProperty('filesUpdated')
      expect(result).toHaveProperty('filesDeleted')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('syncedAt')
    })
  })

  describe('SyncResult Structure', () => {
    it('should have all required fields in result', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const item = createBaseCatalogItem({ type: 'guide' })

      const result = await module.syncItemToGitHub(item)

      // Result should have proper structure regardless of success/failure
      expect(result).toHaveProperty('success')
      expect(Array.isArray(result.filesCreated)).toBe(true)
      expect(Array.isArray(result.filesUpdated)).toBe(true)
      expect(Array.isArray(result.filesDeleted)).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.syncedAt).toBeInstanceOf(Date)
    })

    it('should have all required fields in error case', async () => {
      process.env.GH_TOKEN = ''
      const module = await import('@/lib/marketplace/github-sync')
      const item = createBaseCatalogItem({ marketplaceEnabled: true })

      const result = await module.syncItemToGitHub(item)

      expect(result.success).toBe(false)
      expect(Array.isArray(result.filesCreated)).toBe(true)
      expect(Array.isArray(result.filesUpdated)).toBe(true)
      expect(Array.isArray(result.filesDeleted)).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Item Type Filtering', () => {
    it('should filter guide types in generatePluginFiles', async () => {
      // We can test the transform functions directly for type filtering
      const { generateMarketplaceJson } = await import('@/lib/marketplace/transform')
      const items = [
        createBaseCatalogItem({ id: 'skill-1', type: 'skill', marketplaceEnabled: true }),
        createBaseCatalogItem({ id: 'guide-1', type: 'guide', marketplaceEnabled: true }),
      ]

      const result = generateMarketplaceJson(items)

      // Guides should be filtered out
      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].name).toBe('skill-1')
    })

    it('should filter disabled items in generateMarketplaceJson', async () => {
      const { generateMarketplaceJson } = await import('@/lib/marketplace/transform')
      const items = [
        createBaseCatalogItem({ id: 'enabled', type: 'skill', marketplaceEnabled: true }),
        createBaseCatalogItem({ id: 'disabled', type: 'skill', marketplaceEnabled: false }),
      ]

      const result = generateMarketplaceJson(items)

      // Disabled items should be filtered out
      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].name).toBe('enabled')
    })
  })
})
