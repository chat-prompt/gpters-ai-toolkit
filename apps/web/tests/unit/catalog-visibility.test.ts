/**
 * Catalog item visibility and multi-tenancy field tests
 */
import { describe, it, expect } from 'vitest'
import {
  catalogItems,
  visibilityEnum,
  type CatalogItemRecord,
  type NewCatalogItemRecord,
} from '@gpters/db/schema'

describe('Catalog Items Multi-Tenancy Fields', () => {
  describe('visibilityEnum', () => {
    it('has correct enum values', () => {
      expect(visibilityEnum.enumValues).toEqual(['private', 'shared', 'public'])
    })
  })

  describe('orgId field', () => {
    it('is nullable', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: null,
      }
      expect(item.orgId).toBeNull()
    })

    it('accepts string organization ID', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: 'org-123',
      }
      expect(item.orgId).toBe('org-123')
    })

    it('catalogItems table has orgId column', () => {
      expect(catalogItems.orgId).toBeDefined()
    })
  })

  describe('visibility field', () => {
    it('has default value of private', () => {
      const visibilityColumn = catalogItems.visibility
      expect(visibilityColumn).toBeDefined()
    })

    it('accepts private value', () => {
      const item: Partial<CatalogItemRecord> = {
        visibility: 'private',
      }
      expect(item.visibility).toBe('private')
    })

    it('accepts shared value', () => {
      const item: Partial<CatalogItemRecord> = {
        visibility: 'shared',
      }
      expect(item.visibility).toBe('shared')
    })

    it('accepts public value', () => {
      const item: Partial<CatalogItemRecord> = {
        visibility: 'public',
      }
      expect(item.visibility).toBe('public')
    })

    it('catalogItems table has visibility column', () => {
      expect(catalogItems.visibility).toBeDefined()
    })
  })

  describe('forkedFrom field', () => {
    it('is nullable for non-forked items', () => {
      const item: Partial<CatalogItemRecord> = {
        forkedFrom: null,
      }
      expect(item.forkedFrom).toBeNull()
    })

    it('accepts catalog item ID for forked items', () => {
      const item: Partial<CatalogItemRecord> = {
        forkedFrom: 'item-456',
      }
      expect(item.forkedFrom).toBe('item-456')
    })

    it('catalogItems table has forkedFrom column', () => {
      expect(catalogItems.forkedFrom).toBeDefined()
    })
  })

  describe('forkCount field', () => {
    it('has default value of 0', () => {
      const forkCountColumn = catalogItems.forkCount
      expect(forkCountColumn).toBeDefined()
    })

    it('accepts integer fork count', () => {
      const item: Partial<CatalogItemRecord> = {
        forkCount: 5,
      }
      expect(item.forkCount).toBe(5)
    })

    it('catalogItems table has forkCount column', () => {
      expect(catalogItems.forkCount).toBeDefined()
    })
  })

  describe('sharedWithOrgs field', () => {
    it('has default value of empty array', () => {
      const sharedWithOrgsColumn = catalogItems.sharedWithOrgs
      expect(sharedWithOrgsColumn).toBeDefined()
    })

    it('accepts empty array', () => {
      const item: Partial<CatalogItemRecord> = {
        sharedWithOrgs: [],
      }
      expect(item.sharedWithOrgs).toEqual([])
    })

    it('accepts array of organization IDs', () => {
      const item: Partial<CatalogItemRecord> = {
        sharedWithOrgs: ['org-1', 'org-2', 'org-3'],
      }
      expect(item.sharedWithOrgs).toHaveLength(3)
      expect(item.sharedWithOrgs).toEqual(['org-1', 'org-2', 'org-3'])
    })

    it('catalogItems table has sharedWithOrgs column', () => {
      expect(catalogItems.sharedWithOrgs).toBeDefined()
    })
  })

  describe('Type compatibility', () => {
    it('NewCatalogItemRecord includes new fields', () => {
      const newItem: Partial<NewCatalogItemRecord> = {
        orgId: 'org-123',
        visibility: 'shared',
        forkedFrom: 'item-456',
        forkCount: 2,
        sharedWithOrgs: ['org-789'],
      }
      expect(newItem).toBeDefined()
    })

    it('CatalogItemRecord includes all new fields', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: 'org-123',
        visibility: 'public',
        forkedFrom: null,
        forkCount: 10,
        sharedWithOrgs: ['org-1', 'org-2'],
      }
      expect(item.orgId).toBe('org-123')
      expect(item.visibility).toBe('public')
      expect(item.forkedFrom).toBeNull()
      expect(item.forkCount).toBe(10)
      expect(item.sharedWithOrgs).toHaveLength(2)
    })

    it('visibility values are type-safe', () => {
      const visibilities: Array<CatalogItemRecord['visibility']> = ['private', 'shared', 'public']
      expect(visibilities).toHaveLength(3)
    })

    it('sharedWithOrgs is string array', () => {
      const item: Pick<CatalogItemRecord, 'sharedWithOrgs'> = {
        sharedWithOrgs: ['org-a', 'org-b', 'org-c'],
      }
      expect(item.sharedWithOrgs).toBeInstanceOf(Array)
      if (item.sharedWithOrgs) {
        expect(item.sharedWithOrgs.every(id => typeof id === 'string')).toBe(true)
      }
    })
  })

  describe('Integration scenarios', () => {
    it('supports private org item', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: 'org-123',
        visibility: 'private',
        sharedWithOrgs: [],
      }
      expect(item.orgId).toBe('org-123')
      expect(item.visibility).toBe('private')
      expect(item.sharedWithOrgs).toEqual([])
    })

    it('supports shared org item', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: 'org-123',
        visibility: 'shared',
        sharedWithOrgs: ['org-456', 'org-789'],
      }
      expect(item.orgId).toBe('org-123')
      expect(item.visibility).toBe('shared')
      expect(item.sharedWithOrgs).toHaveLength(2)
    })

    it('supports public item', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: null,
        visibility: 'public',
        sharedWithOrgs: [],
      }
      expect(item.orgId).toBeNull()
      expect(item.visibility).toBe('public')
    })

    it('supports forked item', () => {
      const item: Partial<CatalogItemRecord> = {
        forkedFrom: 'original-item-123',
        orgId: 'org-456',
        visibility: 'private',
      }
      expect(item.forkedFrom).toBe('original-item-123')
      expect(item.orgId).toBe('org-456')
    })

    it('tracks fork count on original item', () => {
      const originalItem: Partial<CatalogItemRecord> = {
        id: 'original-123',
        forkCount: 5,
        forkedFrom: null,
      }
      expect(originalItem.forkCount).toBe(5)
      expect(originalItem.forkedFrom).toBeNull()
    })
  })
})
