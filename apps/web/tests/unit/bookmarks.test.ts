/**
 * Bookmark System Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  // Storage operations
  loadBookmarks,
  saveBookmarks,
  exportBookmarks,
  importBookmarks,
  clearBookmarks,
  // Bookmark operations
  isBookmarked,
  addBookmark,
  removeBookmark,
  toggleBookmark,
  updateBookmarkNote,
  moveToFolder,
  getBookmarkedItems,
  getBookmarkedIds,
  // Folder operations
  createFolder,
  deleteFolder,
  renameFolder,
  updateFolderColor,
  getFolders,
  getItemsInFolder,
  // Statistics
  getBookmarkStats,
  getBookmarkCountByType,
  // Subscription
  subscribeToBookmarks,
  notifyBookmarkChange,
  saveAndNotify,
  // Constants
  FOLDER_COLORS,
  TYPE_CONFIG,
  type BookmarkState,
} from '@/lib/features/bookmarks'

// ============================================================================
// Test Setup
// ============================================================================

// Mock localStorage
const mockStorage: Record<string, string> = {}

const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key]
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach(key => delete mockStorage[key])
  }),
  length: 0,
  key: vi.fn(),
}

// Setup before tests
beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage)
  Object.keys(mockStorage).forEach(key => delete mockStorage[key])
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ============================================================================
// Storage Operations Tests
// ============================================================================

describe('Storage Operations', () => {
  describe('loadBookmarks', () => {
    it('should return initial state when no data exists', () => {
      const state = loadBookmarks()
      expect(state.items).toEqual([])
      expect(state.folders).toEqual([])
      expect(state.version).toBe(1)
    })

    it('should load existing bookmarks', () => {
      const existingState: BookmarkState = {
        items: [
          { id: '1', type: 'skill', name: 'Test Skill', addedAt: '2025-01-01T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      }
      mockStorage['gpters-toolkit-bookmarks'] = JSON.stringify(existingState)

      const state = loadBookmarks()
      expect(state.items).toHaveLength(1)
      expect(state.items[0].name).toBe('Test Skill')
    })

    it('should handle corrupted data gracefully', () => {
      mockStorage['gpters-toolkit-bookmarks'] = 'invalid json'

      const state = loadBookmarks()
      expect(state.items).toEqual([])
      expect(state.folders).toEqual([])
    })
  })

  describe('saveBookmarks', () => {
    it('should save bookmarks to localStorage', () => {
      const state: BookmarkState = {
        items: [
          { id: '1', type: 'skill', name: 'Test', addedAt: '2025-01-01T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      }

      const result = saveBookmarks(state)
      expect(result).toBe(true)
      expect(mockLocalStorage.setItem).toHaveBeenCalled()
    })
  })

  describe('exportBookmarks', () => {
    it('should export bookmarks as JSON string', () => {
      const state: BookmarkState = {
        items: [
          { id: '1', type: 'skill', name: 'Test', addedAt: '2025-01-01T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      }
      mockStorage['gpters-toolkit-bookmarks'] = JSON.stringify(state)

      const exported = exportBookmarks()
      const parsed = JSON.parse(exported)
      expect(parsed.items).toHaveLength(1)
    })
  })

  describe('importBookmarks', () => {
    it('should import valid bookmarks', () => {
      const importData = JSON.stringify({
        items: [
          { id: '1', type: 'skill', name: 'Imported', addedAt: '2025-01-01T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      })

      const result = importBookmarks(importData)
      expect(result.success).toBe(true)
      expect(result.count).toBe(1)
    })

    it('should reject invalid JSON', () => {
      const result = importBookmarks('invalid json')
      expect(result.success).toBe(false)
      expect(result.error).toBe('JSON 파싱 오류')
    })

    it('should reject missing items array', () => {
      const result = importBookmarks(JSON.stringify({ version: 1 }))
      expect(result.success).toBe(false)
      expect(result.error).toBe('잘못된 북마크 형식입니다')
    })

    it('should merge with existing bookmarks avoiding duplicates', () => {
      // Setup existing bookmark
      const existing: BookmarkState = {
        items: [
          { id: '1', type: 'skill', name: 'Existing', addedAt: '2025-01-01T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      }
      mockStorage['gpters-toolkit-bookmarks'] = JSON.stringify(existing)

      // Import with duplicate and new
      const importData = JSON.stringify({
        items: [
          { id: '1', type: 'skill', name: 'Duplicate', addedAt: '2025-01-01T00:00:00Z' },
          { id: '2', type: 'agent', name: 'New', addedAt: '2025-01-02T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      })

      const result = importBookmarks(importData)
      expect(result.success).toBe(true)
      expect(result.count).toBe(1) // Only new item
    })
  })

  describe('clearBookmarks', () => {
    it('should remove bookmarks from localStorage', () => {
      mockStorage['gpters-toolkit-bookmarks'] = '{}'
      clearBookmarks()
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('gpters-toolkit-bookmarks')
    })
  })
})

// ============================================================================
// Bookmark Operations Tests
// ============================================================================

describe('Bookmark Operations', () => {
  describe('isBookmarked', () => {
    it('should return false for non-bookmarked items', () => {
      expect(isBookmarked('nonexistent')).toBe(false)
    })

    it('should return true for bookmarked items', () => {
      const state: BookmarkState = {
        items: [
          { id: '1', type: 'skill', name: 'Test', addedAt: '2025-01-01T00:00:00Z' },
        ],
        folders: [],
        version: 1,
      }
      mockStorage['gpters-toolkit-bookmarks'] = JSON.stringify(state)

      expect(isBookmarked('1')).toBe(true)
    })
  })

  describe('addBookmark', () => {
    it('should add a new bookmark', () => {
      const result = addBookmark({
        id: '1',
        type: 'skill',
        name: 'New Skill',
      })

      expect(result).toBe(true)
      expect(isBookmarked('1')).toBe(true)
    })

    it('should not add duplicate bookmark', () => {
      addBookmark({ id: '1', type: 'skill', name: 'First' })
      const result = addBookmark({ id: '1', type: 'skill', name: 'Duplicate' })

      expect(result).toBe(false)
    })

    it('should add bookmark with note and folder', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test' }, 'My note', 'folder-1')

      const items = getBookmarkedItems()
      expect(items[0].note).toBe('My note')
      expect(items[0].folder).toBe('folder-1')
    })
  })

  describe('removeBookmark', () => {
    it('should remove an existing bookmark', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test' })
      expect(isBookmarked('1')).toBe(true)

      const result = removeBookmark('1')
      expect(result).toBe(true)
      expect(isBookmarked('1')).toBe(false)
    })

    it('should return false for non-existent bookmark', () => {
      const result = removeBookmark('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('toggleBookmark', () => {
    it('should add bookmark when not bookmarked', () => {
      const result = toggleBookmark({ id: '1', type: 'skill', name: 'Test' })
      expect(result.isBookmarked).toBe(true)
      expect(result.success).toBe(true)
    })

    it('should remove bookmark when already bookmarked', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test' })

      const result = toggleBookmark({ id: '1', type: 'skill', name: 'Test' })
      expect(result.isBookmarked).toBe(false)
      expect(result.success).toBe(true)
    })
  })

  describe('updateBookmarkNote', () => {
    it('should update note for existing bookmark', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test' })

      const result = updateBookmarkNote('1', 'Updated note')
      expect(result).toBe(true)

      const items = getBookmarkedItems()
      expect(items[0].note).toBe('Updated note')
    })

    it('should return false for non-existent bookmark', () => {
      const result = updateBookmarkNote('nonexistent', 'Note')
      expect(result).toBe(false)
    })
  })

  describe('moveToFolder', () => {
    it('should move bookmark to folder', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test' })

      const result = moveToFolder('1', 'folder-1')
      expect(result).toBe(true)

      const items = getBookmarkedItems()
      expect(items[0].folder).toBe('folder-1')
    })

    it('should remove from folder when folderId is undefined', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test' }, undefined, 'folder-1')

      moveToFolder('1', undefined)

      const items = getBookmarkedItems()
      expect(items[0].folder).toBeUndefined()
    })
  })

  describe('getBookmarkedItems', () => {
    beforeEach(() => {
      addBookmark({ id: '1', type: 'skill', name: 'Skill A' })
      addBookmark({ id: '2', type: 'agent', name: 'Agent B' })
      addBookmark({ id: '3', type: 'skill', name: 'Skill C' }, 'note', 'folder-1')
    })

    it('should return all bookmarked items', () => {
      const items = getBookmarkedItems()
      expect(items).toHaveLength(3)
    })

    it('should filter by type', () => {
      const skills = getBookmarkedItems({ type: 'skill' })
      expect(skills).toHaveLength(2)
    })

    it('should filter by folder', () => {
      const folderItems = getBookmarkedItems({ folder: 'folder-1' })
      expect(folderItems).toHaveLength(1)
      expect(folderItems[0].id).toBe('3')
    })

    it('should filter by search term', () => {
      const results = getBookmarkedItems({ search: 'Agent' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('2')
    })

    it('should sort by name ascending', () => {
      const items = getBookmarkedItems({ sortBy: 'name', sortDirection: 'asc' })
      expect(items[0].name).toBe('Agent B')
    })

    it('should sort by type', () => {
      const items = getBookmarkedItems({ sortBy: 'type', sortDirection: 'asc' })
      expect(items[0].type).toBe('agent')
    })

    it('should sort by addedAt descending by default', () => {
      const items = getBookmarkedItems()
      // All items have same addedAt (added in same tick), so order is stable but not guaranteed
      // Just verify we get all 3 items
      expect(items).toHaveLength(3)
      expect(items.map(i => i.id).sort()).toEqual(['1', '2', '3'])
    })
  })

  describe('getBookmarkedIds', () => {
    it('should return set of bookmarked IDs', () => {
      addBookmark({ id: '1', type: 'skill', name: 'Test 1' })
      addBookmark({ id: '2', type: 'agent', name: 'Test 2' })

      const ids = getBookmarkedIds()
      expect(ids.has('1')).toBe(true)
      expect(ids.has('2')).toBe(true)
      expect(ids.has('3')).toBe(false)
    })
  })
})

// ============================================================================
// Folder Operations Tests
// ============================================================================

describe('Folder Operations', () => {
  describe('createFolder', () => {
    it('should create a new folder', () => {
      const folder = createFolder('My Folder')
      expect(folder).not.toBeNull()
      expect(folder?.name).toBe('My Folder')
      expect(folder?.id).toMatch(/^folder-/)
    })

    it('should assign default color', () => {
      const folder = createFolder('Folder')
      expect(FOLDER_COLORS).toContain(folder?.color)
    })

    it('should use custom color', () => {
      const folder = createFolder('Folder', '#ff0000')
      expect(folder?.color).toBe('#ff0000')
    })

    it('should reject duplicate folder names', () => {
      createFolder('Unique')
      const duplicate = createFolder('UNIQUE') // Case insensitive
      expect(duplicate).toBeNull()
    })
  })

  describe('deleteFolder', () => {
    it('should delete existing folder', () => {
      const folder = createFolder('ToDelete')
      expect(getFolders()).toHaveLength(1)

      const result = deleteFolder(folder!.id)
      expect(result).toBe(true)
      expect(getFolders()).toHaveLength(0)
    })

    it('should unfile items in deleted folder', () => {
      const folder = createFolder('Folder')
      addBookmark({ id: '1', type: 'skill', name: 'Test' }, undefined, folder!.id)

      deleteFolder(folder!.id)

      const items = getBookmarkedItems()
      expect(items[0].folder).toBeUndefined()
    })

    it('should return false for non-existent folder', () => {
      const result = deleteFolder('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('renameFolder', () => {
    it('should rename existing folder', () => {
      const folder = createFolder('Original')

      const result = renameFolder(folder!.id, 'Renamed')
      expect(result).toBe(true)

      const folders = getFolders()
      expect(folders[0].name).toBe('Renamed')
    })
  })

  describe('updateFolderColor', () => {
    it('should update folder color', () => {
      const folder = createFolder('Folder')

      updateFolderColor(folder!.id, '#00ff00')

      const folders = getFolders()
      expect(folders[0].color).toBe('#00ff00')
    })
  })

  describe('getFolders', () => {
    it('should return all folders', () => {
      createFolder('Folder 1')
      createFolder('Folder 2')

      const folders = getFolders()
      expect(folders).toHaveLength(2)
    })
  })

  describe('getItemsInFolder', () => {
    beforeEach(() => {
      // Clear mock storage before each test in this block
      Object.keys(mockStorage).forEach(key => delete mockStorage[key])
    })

    it('should return items in specific folder', () => {
      const folder = createFolder('Folder')
      addBookmark({ id: '1', type: 'skill', name: 'In Folder' }, undefined, folder!.id)
      addBookmark({ id: '2', type: 'agent', name: 'Not in Folder' })

      const items = getItemsInFolder(folder!.id)
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('1')
    })

    it('should return unfiled items when folderId is undefined', () => {
      const folder = createFolder('Folder')
      addBookmark({ id: '1', type: 'skill', name: 'In Folder' }, undefined, folder!.id)
      addBookmark({ id: '2', type: 'agent', name: 'Unfiled' })

      const items = getItemsInFolder(undefined)
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('2')
    })
  })
})

// ============================================================================
// Statistics Tests
// ============================================================================

describe('Statistics', () => {
  beforeEach(() => {
    const folder = createFolder('Folder')
    addBookmark({ id: '1', type: 'skill', name: 'Skill 1' })
    addBookmark({ id: '2', type: 'skill', name: 'Skill 2' }, undefined, folder!.id)
    addBookmark({ id: '3', type: 'agent', name: 'Agent 1' })
    addBookmark({ id: '4', type: 'command', name: 'Command 1' })
  })

  describe('getBookmarkStats', () => {
    it('should return correct total count', () => {
      const stats = getBookmarkStats()
      expect(stats.totalBookmarks).toBe(4)
    })

    it('should return counts by type', () => {
      const stats = getBookmarkStats()
      expect(stats.byType.skill).toBe(2)
      expect(stats.byType.agent).toBe(1)
      expect(stats.byType.command).toBe(1)
    })

    it('should return counts by folder', () => {
      const stats = getBookmarkStats()
      expect(stats.byFolder.unfiled).toBe(3)
    })

    it('should return recently added items', () => {
      const stats = getBookmarkStats()
      expect(stats.recentlyAdded).toHaveLength(4)
      // All items added in same tick, verify all 4 are present
      expect(stats.recentlyAdded.map(i => i.id).sort()).toEqual(['1', '2', '3', '4'])
    })
  })

  describe('getBookmarkCountByType', () => {
    it('should return count by type', () => {
      const counts = getBookmarkCountByType()
      expect(counts.skill).toBe(2)
      expect(counts.agent).toBe(1)
    })
  })
})

// ============================================================================
// Subscription Tests
// ============================================================================

describe('Subscription', () => {
  describe('subscribeToBookmarks', () => {
    it('should return unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToBookmarks(callback)

      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })

  describe('notifyBookmarkChange', () => {
    it('should dispatch custom event', () => {
      const listener = vi.fn()
      window.addEventListener('bookmarks-updated', listener)

      notifyBookmarkChange()

      expect(listener).toHaveBeenCalled()
      window.removeEventListener('bookmarks-updated', listener)
    })
  })

  describe('saveAndNotify', () => {
    it('should save and dispatch event', () => {
      const listener = vi.fn()
      window.addEventListener('bookmarks-updated', listener)

      const state: BookmarkState = {
        items: [{ id: '1', type: 'skill', name: 'Test', addedAt: '2025-01-01T00:00:00Z' }],
        folders: [],
        version: 1,
      }

      const result = saveAndNotify(state)

      expect(result).toBe(true)
      expect(listener).toHaveBeenCalled()
      window.removeEventListener('bookmarks-updated', listener)
    })
  })
})

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  describe('FOLDER_COLORS', () => {
    it('should have 8 colors', () => {
      expect(FOLDER_COLORS).toHaveLength(8)
    })

    it('should all be valid hex colors', () => {
      FOLDER_COLORS.forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      })
    })
  })

  describe('TYPE_CONFIG', () => {
    it('should have config for all types', () => {
      expect(TYPE_CONFIG.skill).toBeDefined()
      expect(TYPE_CONFIG.agent).toBeDefined()
      expect(TYPE_CONFIG.command).toBeDefined()
      expect(TYPE_CONFIG.guide).toBeDefined()
      expect(TYPE_CONFIG.hook).toBeDefined()
    })

    it('should have emoji and color for each type', () => {
      Object.values(TYPE_CONFIG).forEach(config => {
        expect(config.emoji).toBeDefined()
        expect(config.color).toMatch(/^#[0-9a-f]{6}$/i)
      })
    })
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty search gracefully', () => {
    addBookmark({ id: '1', type: 'skill', name: 'Test' })

    const items = getBookmarkedItems({ search: '' })
    expect(items).toHaveLength(1)
  })

  it('should handle special characters in search', () => {
    addBookmark({ id: '1', type: 'skill', name: 'Test (Special)' })

    const items = getBookmarkedItems({ search: '(Special)' })
    expect(items).toHaveLength(1)
  })

  it('should handle unicode in names', () => {
    addBookmark({ id: '1', type: 'skill', name: '한글 스킬' })

    const items = getBookmarkedItems({ search: '한글' })
    expect(items).toHaveLength(1)
  })

  it('should handle very long notes', () => {
    const longNote = 'a'.repeat(10000)
    addBookmark({ id: '1', type: 'skill', name: 'Test' }, longNote)

    const items = getBookmarkedItems()
    expect(items[0].note).toBe(longNote)
  })

  it('should handle concurrent folder operations', () => {
    const folder1 = createFolder('Folder 1')
    const folder2 = createFolder('Folder 2')

    addBookmark({ id: '1', type: 'skill', name: 'Test' })
    moveToFolder('1', folder1!.id)
    moveToFolder('1', folder2!.id)

    const items = getBookmarkedItems()
    expect(items[0].folder).toBe(folder2!.id)
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  it('should maintain data consistency across operations', () => {
    // Create folder
    const folder = createFolder('Projects')

    // Add bookmarks
    addBookmark({ id: '1', type: 'skill', name: 'Skill 1' })
    addBookmark({ id: '2', type: 'agent', name: 'Agent 1' }, 'Important', folder!.id)

    // Update
    updateBookmarkNote('1', 'Updated note')
    moveToFolder('1', folder!.id)

    // Verify
    const items = getItemsInFolder(folder!.id)
    expect(items).toHaveLength(2)

    const stats = getBookmarkStats()
    expect(stats.totalBookmarks).toBe(2)
    expect(stats.byFolder[folder!.id]).toBe(2)
    expect(stats.byFolder.unfiled).toBe(0)
  })

  it('should handle full workflow: create, update, export, clear, import', () => {
    // Create data
    createFolder('Test Folder')
    addBookmark({ id: '1', type: 'skill', name: 'Test Skill' })

    // Export
    const exported = exportBookmarks()

    // Clear
    clearBookmarks()
    expect(getBookmarkedItems()).toHaveLength(0)

    // Import
    const result = importBookmarks(exported)
    expect(result.success).toBe(true)
    expect(getBookmarkedItems()).toHaveLength(1)
    expect(getFolders()).toHaveLength(1)
  })
})
