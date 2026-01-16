/**
 * Bookmark/Favorites System
 *
 * Client-side bookmark management using localStorage.
 * Provides functionality to save, remove, and organize favorite items.
 */

// ============================================================================
// Types
// ============================================================================

export interface BookmarkedItem {
  id: string
  type: 'skill' | 'agent' | 'command' | 'guide' | 'hook'
  name: string
  addedAt: string // ISO date string
  note?: string
  folder?: string
}

export interface BookmarkFolder {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface BookmarkState {
  items: BookmarkedItem[]
  folders: BookmarkFolder[]
  version: number
}

export interface BookmarkStats {
  totalBookmarks: number
  byType: Record<string, number>
  byFolder: Record<string, number>
  recentlyAdded: BookmarkedItem[]
}

export type SortOption = 'addedAt' | 'name' | 'type'
export type SortDirection = 'asc' | 'desc'

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'gpters-toolkit-bookmarks'
const CURRENT_VERSION = 1

/**
 * Default folder colors for bookmark organization
 */
export const FOLDER_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#14b8a6', // Teal
] as const

/**
 * Type-specific icons/colors
 */
export const TYPE_CONFIG = {
  skill: { emoji: '🎯', color: '#6366f1' },
  agent: { emoji: '🤖', color: '#10b981' },
  command: { emoji: '⚡', color: '#f59e0b' },
  guide: { emoji: '📚', color: '#3b82f6' },
  hook: { emoji: '🪝', color: '#8b5cf6' },
} as const

// ============================================================================
// Storage Operations
// ============================================================================

/**
 * Get initial empty state
 */
function getInitialState(): BookmarkState {
  return {
    items: [],
    folders: [],
    version: CURRENT_VERSION,
  }
}

/**
 * Load bookmarks from localStorage
 */
export function loadBookmarks(): BookmarkState {
  if (typeof window === 'undefined') {
    return getInitialState()
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return getInitialState()
    }

    const parsed = JSON.parse(stored) as BookmarkState

    // Version migration if needed
    if (parsed.version !== CURRENT_VERSION) {
      return migrateBookmarks(parsed)
    }

    return parsed
  } catch (error) {
    console.error('Failed to load bookmarks:', error)
    return getInitialState()
  }
}

/**
 * Save bookmarks to localStorage
 */
export function saveBookmarks(state: BookmarkState): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (error) {
    console.error('Failed to save bookmarks:', error)
    return false
  }
}

/**
 * Migrate bookmarks from older versions
 */
function migrateBookmarks(oldState: BookmarkState): BookmarkState {
  // Currently no migration needed, just update version
  return {
    ...oldState,
    version: CURRENT_VERSION,
  }
}

/**
 * Export bookmarks as JSON
 */
export function exportBookmarks(): string {
  const state = loadBookmarks()
  return JSON.stringify(state, null, 2)
}

/**
 * Import bookmarks from JSON
 */
export function importBookmarks(json: string): { success: boolean; error?: string; count?: number } {
  try {
    const imported = JSON.parse(json) as BookmarkState

    if (!imported.items || !Array.isArray(imported.items)) {
      return { success: false, error: '잘못된 북마크 형식입니다' }
    }

    // Validate items
    const validItems = imported.items.filter(
      item => item.id && item.type && item.name && item.addedAt
    )

    const currentState = loadBookmarks()

    // Merge with existing (avoid duplicates)
    const existingIds = new Set(currentState.items.map(i => i.id))
    const newItems = validItems.filter(item => !existingIds.has(item.id))

    // Merge folders
    const existingFolderIds = new Set(currentState.folders.map(f => f.id))
    const newFolders = (imported.folders || []).filter(
      folder => !existingFolderIds.has(folder.id)
    )

    const newState: BookmarkState = {
      items: [...currentState.items, ...newItems],
      folders: [...currentState.folders, ...newFolders],
      version: CURRENT_VERSION,
    }

    saveBookmarks(newState)

    return { success: true, count: newItems.length }
  } catch {
    return { success: false, error: 'JSON 파싱 오류' }
  }
}

/**
 * Clear all bookmarks
 */
export function clearBookmarks(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

// ============================================================================
// Bookmark Operations
// ============================================================================

/**
 * Check if an item is bookmarked
 */
export function isBookmarked(itemId: string): boolean {
  const state = loadBookmarks()
  return state.items.some(item => item.id === itemId)
}

/**
 * Add a bookmark
 */
export function addBookmark(
  item: Omit<BookmarkedItem, 'addedAt'>,
  note?: string,
  folder?: string
): boolean {
  const state = loadBookmarks()

  // Check if already bookmarked
  if (state.items.some(i => i.id === item.id)) {
    return false
  }

  const newItem: BookmarkedItem = {
    ...item,
    addedAt: new Date().toISOString(),
    note,
    folder,
  }

  state.items.push(newItem)
  return saveBookmarks(state)
}

/**
 * Remove a bookmark
 */
export function removeBookmark(itemId: string): boolean {
  const state = loadBookmarks()
  const initialLength = state.items.length

  state.items = state.items.filter(item => item.id !== itemId)

  if (state.items.length === initialLength) {
    return false // Item wasn't bookmarked
  }

  return saveBookmarks(state)
}

/**
 * Toggle bookmark status
 */
export function toggleBookmark(
  item: Omit<BookmarkedItem, 'addedAt'>
): { isBookmarked: boolean; success: boolean } {
  if (isBookmarked(item.id)) {
    const success = removeBookmark(item.id)
    return { isBookmarked: false, success }
  } else {
    const success = addBookmark(item)
    return { isBookmarked: true, success }
  }
}

/**
 * Update a bookmark's note
 */
export function updateBookmarkNote(itemId: string, note: string): boolean {
  const state = loadBookmarks()
  const item = state.items.find(i => i.id === itemId)

  if (!item) return false

  item.note = note
  return saveBookmarks(state)
}

/**
 * Move a bookmark to a folder
 */
export function moveToFolder(itemId: string, folderId: string | undefined): boolean {
  const state = loadBookmarks()
  const item = state.items.find(i => i.id === itemId)

  if (!item) return false

  item.folder = folderId
  return saveBookmarks(state)
}

/**
 * Get all bookmarked items
 */
export function getBookmarkedItems(
  options?: {
    type?: string
    folder?: string
    sortBy?: SortOption
    sortDirection?: SortDirection
    search?: string
  }
): BookmarkedItem[] {
  const state = loadBookmarks()
  let items = [...state.items]

  // Filter by type
  if (options?.type) {
    items = items.filter(item => item.type === options.type)
  }

  // Filter by folder (check if 'folder' key exists in options, not just if it's truthy)
  if (options && 'folder' in options) {
    items = items.filter(item => item.folder === options.folder)
  }

  // Filter by search
  if (options?.search) {
    const searchLower = options.search.toLowerCase()
    items = items.filter(
      item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.note?.toLowerCase().includes(searchLower)
    )
  }

  // Sort
  const sortBy = options?.sortBy || 'addedAt'
  const direction = options?.sortDirection || 'desc'

  items.sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'addedAt':
        comparison = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
        break
      case 'name':
        comparison = a.name.localeCompare(b.name, 'ko')
        break
      case 'type':
        comparison = a.type.localeCompare(b.type)
        break
    }

    return direction === 'asc' ? comparison : -comparison
  })

  return items
}

/**
 * Get bookmarked item IDs (for quick lookup)
 */
export function getBookmarkedIds(): Set<string> {
  const state = loadBookmarks()
  return new Set(state.items.map(item => item.id))
}

// ============================================================================
// Folder Operations
// ============================================================================

/**
 * Create a new folder
 */
export function createFolder(name: string, color?: string): BookmarkFolder | null {
  const state = loadBookmarks()

  // Check for duplicate names
  if (state.folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    return null
  }

  const folder: BookmarkFolder = {
    id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    color: color || FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length],
    createdAt: new Date().toISOString(),
  }

  state.folders.push(folder)
  saveBookmarks(state)

  return folder
}

/**
 * Delete a folder (items become unfiled)
 */
export function deleteFolder(folderId: string): boolean {
  const state = loadBookmarks()

  const folderIndex = state.folders.findIndex(f => f.id === folderId)
  if (folderIndex === -1) return false

  // Remove folder
  state.folders.splice(folderIndex, 1)

  // Unfile items in this folder
  state.items.forEach(item => {
    if (item.folder === folderId) {
      item.folder = undefined
    }
  })

  return saveBookmarks(state)
}

/**
 * Rename a folder
 */
export function renameFolder(folderId: string, newName: string): boolean {
  const state = loadBookmarks()
  const folder = state.folders.find(f => f.id === folderId)

  if (!folder) return false

  folder.name = newName
  return saveBookmarks(state)
}

/**
 * Update folder color
 */
export function updateFolderColor(folderId: string, color: string): boolean {
  const state = loadBookmarks()
  const folder = state.folders.find(f => f.id === folderId)

  if (!folder) return false

  folder.color = color
  return saveBookmarks(state)
}

/**
 * Get all folders
 */
export function getFolders(): BookmarkFolder[] {
  const state = loadBookmarks()
  return state.folders
}

/**
 * Get items in a specific folder
 */
export function getItemsInFolder(folderId: string | undefined): BookmarkedItem[] {
  return getBookmarkedItems({ folder: folderId })
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get bookmark statistics
 */
export function getBookmarkStats(): BookmarkStats {
  const state = loadBookmarks()

  const byType: Record<string, number> = {}
  const byFolder: Record<string, number> = { unfiled: 0 }

  state.items.forEach(item => {
    // Count by type
    byType[item.type] = (byType[item.type] || 0) + 1

    // Count by folder
    if (item.folder) {
      byFolder[item.folder] = (byFolder[item.folder] || 0) + 1
    } else {
      byFolder.unfiled++
    }
  })

  // Get 5 most recently added
  const recentlyAdded = [...state.items]
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, 5)

  return {
    totalBookmarks: state.items.length,
    byType,
    byFolder,
    recentlyAdded,
  }
}

/**
 * Get count of bookmarks by type
 */
export function getBookmarkCountByType(): Record<string, number> {
  return getBookmarkStats().byType
}

// ============================================================================
// Hooks Support
// ============================================================================

/**
 * Subscribe to bookmark changes (for React hooks)
 */
export function subscribeToBookmarks(callback: (state: BookmarkState) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(loadBookmarks())
    }
  }

  window.addEventListener('storage', handleStorageChange)

  // Also handle local changes via custom event
  const handleLocalChange = () => {
    callback(loadBookmarks())
  }

  window.addEventListener('bookmarks-updated', handleLocalChange)

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener('bookmarks-updated', handleLocalChange)
  }
}

/**
 * Dispatch bookmark update event (for local sync)
 */
export function notifyBookmarkChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('bookmarks-updated'))
}

/**
 * Enhanced save with notification
 */
export function saveAndNotify(state: BookmarkState): boolean {
  const result = saveBookmarks(state)
  if (result) {
    notifyBookmarkChange()
  }
  return result
}
