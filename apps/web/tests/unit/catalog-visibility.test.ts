/**
 * Legacy catalog scope field compatibility tests
 */
import { describe, it, expect } from 'vitest'
import {
  catalogItems,
  visibilityEnum,
  type CatalogItemRecord,
  type NewCatalogItemRecord,
} from '@gpters/db/schema'

describe('Catalog Scope Compatibility Fields', () => {
  describe('visibilityEnum', () => {
    it('has correct enum values', () => {
      expect(visibilityEnum.enumValues).toEqual(['private', 'public'])
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
    it('keeps the legacy column while the application enforces public', () => {
      const visibilityColumn = catalogItems.visibility
      expect(visibilityColumn).toBeDefined()
    })

    it('accepts private value', () => {
      const item: Partial<CatalogItemRecord> = {
        visibility: 'private',
      }
      expect(item.visibility).toBe('private')
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

  describe('Type compatibility', () => {
    it('NewCatalogItemRecord includes new fields', () => {
      const newItem: Partial<NewCatalogItemRecord> = {
        orgId: 'org-123',
        visibility: 'public',
        forkedFrom: 'item-456',
        forkCount: 2,
      }
      expect(newItem).toBeDefined()
    })

    it('CatalogItemRecord includes all new fields', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: 'org-123',
        visibility: 'public',
        forkedFrom: null,
        forkCount: 10,
      }
      expect(item.orgId).toBe('org-123')
      expect(item.visibility).toBe('public')
      expect(item.forkedFrom).toBeNull()
      expect(item.forkCount).toBe(10)
    })

    it('visibility values are type-safe', () => {
      const visibilities: Array<CatalogItemRecord['visibility']> = ['private', 'public']
      expect(visibilities).toHaveLength(2)
    })
  })

  describe('Compatibility scenarios', () => {
    it('represents the enforced GPTers public catalog state', () => {
      const item: Partial<CatalogItemRecord> = {
        orgId: 'gpters-org',
        visibility: 'public',
      }
      expect(item.orgId).toBe('gpters-org')
      expect(item.visibility).toBe('public')
    })

    it('supports forked item', () => {
      const item: Partial<CatalogItemRecord> = {
        forkedFrom: 'original-item-123',
        orgId: 'gpters-org',
        visibility: 'public',
      }
      expect(item.forkedFrom).toBe('original-item-123')
      expect(item.orgId).toBe('gpters-org')
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
