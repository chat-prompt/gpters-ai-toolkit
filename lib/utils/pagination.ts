/**
 * Pagination and Virtual Scroll System
 * 페이지네이션 및 가상 스크롤 시스템
 *
 * Features:
 * - Traditional pagination with page numbers
 * - Cursor-based pagination for infinite scroll
 * - Virtual scrolling for large lists
 * - Responsive page size options
 * - Scroll position preservation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Page size options
 */
export type PageSize = 12 | 24 | 48 | 96

/**
 * Pagination state
 */
export interface PaginationState {
  currentPage: number
  pageSize: PageSize
  totalItems: number
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[]
  pagination: {
    currentPage: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
    startIndex: number
    endIndex: number
  }
}

/**
 * Page info for rendering
 */
export interface PageInfo {
  currentPage: number
  totalPages: number
  pageSize: PageSize
  totalItems: number
  startItem: number
  endItem: number
  hasNextPage: boolean
  hasPrevPage: boolean
  pageNumbers: number[]
}

/**
 * Cursor-based pagination for infinite scroll
 */
export interface CursorPaginationState {
  cursor: string | null
  hasMore: boolean
  isLoading: boolean
  loadedCount: number
}

/**
 * Cursor-based result
 */
export interface CursorPaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
  totalCount?: number
}

/**
 * Virtual scroll state
 */
export interface VirtualScrollState {
  scrollTop: number
  containerHeight: number
  itemHeight: number
  totalItems: number
  overscan: number
}

/**
 * Virtual scroll range
 */
export interface VirtualScrollRange {
  startIndex: number
  endIndex: number
  visibleCount: number
  offsetTop: number
  totalHeight: number
  paddingTop: number
  paddingBottom: number
}

/**
 * Infinite scroll state
 */
export interface InfiniteScrollState {
  items: unknown[]
  page: number
  hasMore: boolean
  isLoading: boolean
  error: Error | null
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Available page sizes
 */
export const PAGE_SIZE_OPTIONS: Array<{ value: PageSize; label: string }> = [
  { value: 12, label: '12개' },
  { value: 24, label: '24개' },
  { value: 48, label: '48개' },
  { value: 96, label: '96개' },
]

/**
 * Default pagination state
 */
export const DEFAULT_PAGINATION_STATE: PaginationState = {
  currentPage: 1,
  pageSize: 24,
  totalItems: 0,
}

/**
 * Default virtual scroll settings
 */
export const DEFAULT_VIRTUAL_SCROLL: Omit<VirtualScrollState, 'totalItems'> = {
  scrollTop: 0,
  containerHeight: 600,
  itemHeight: 200,
  overscan: 3,
}

// ============================================================================
// Traditional Pagination
// ============================================================================

/**
 * Calculate total number of pages
 */
export function getTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

/**
 * Get items for a specific page
 */
export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const totalItems = items.length
  const totalPages = getTotalPages(totalItems, pageSize)
  const currentPage = Math.max(1, Math.min(page, totalPages))

  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const pageItems = items.slice(startIndex, endIndex)

  return {
    items: pageItems,
    pagination: {
      currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      startIndex: startIndex + 1,
      endIndex,
    },
  }
}

/**
 * Generate page numbers for navigation
 * Shows first, last, and surrounding pages with ellipsis
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 7
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = []
  const halfVisible = Math.floor((maxVisible - 3) / 2)

  // Always show first page
  pages.push(1)

  // Calculate range around current page
  let start = Math.max(2, currentPage - halfVisible)
  let end = Math.min(totalPages - 1, currentPage + halfVisible)

  // Adjust if at start or end
  if (currentPage <= halfVisible + 2) {
    end = Math.min(maxVisible - 2, totalPages - 1)
  } else if (currentPage >= totalPages - halfVisible - 1) {
    start = Math.max(2, totalPages - maxVisible + 3)
  }

  // Add ellipsis or pages
  if (start > 2) {
    pages.push('ellipsis')
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (end < totalPages - 1) {
    pages.push('ellipsis')
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

/**
 * Get complete page info for rendering
 */
export function getPageInfo(state: PaginationState): PageInfo {
  const { currentPage, pageSize, totalItems } = state
  const totalPages = getTotalPages(totalItems, pageSize)
  const validPage = Math.max(1, Math.min(currentPage, totalPages))

  const startItem = totalItems === 0 ? 0 : (validPage - 1) * pageSize + 1
  const endItem = Math.min(validPage * pageSize, totalItems)

  return {
    currentPage: validPage,
    totalPages,
    pageSize,
    totalItems,
    startItem,
    endItem,
    hasNextPage: validPage < totalPages,
    hasPrevPage: validPage > 1,
    pageNumbers: getPageNumbers(validPage, totalPages).filter(
      (p): p is number => typeof p === 'number'
    ),
  }
}

/**
 * Validate and constrain page number
 */
export function validatePage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(page, totalPages))
}

/**
 * Get safe page after item count changes
 */
export function getAdjustedPage(
  currentPage: number,
  oldTotal: number,
  newTotal: number,
  pageSize: number
): number {
  const newTotalPages = getTotalPages(newTotal, pageSize)
  return Math.min(currentPage, newTotalPages)
}

// ============================================================================
// Cursor-based Pagination
// ============================================================================

/**
 * Create initial cursor pagination state
 */
export function createCursorPaginationState(): CursorPaginationState {
  return {
    cursor: null,
    hasMore: true,
    isLoading: false,
    loadedCount: 0,
  }
}

/**
 * Update cursor pagination state after loading
 */
export function updateCursorPagination<T>(
  state: CursorPaginationState,
  result: CursorPaginatedResult<T>
): CursorPaginationState {
  return {
    cursor: result.nextCursor,
    hasMore: result.hasMore,
    isLoading: false,
    loadedCount: state.loadedCount + result.items.length,
  }
}

/**
 * Generate cursor from item ID or timestamp
 */
export function createCursor(
  itemId: string,
  timestamp?: string | Date
): string {
  const ts = timestamp
    ? typeof timestamp === 'string'
      ? timestamp
      : timestamp.toISOString()
    : new Date().toISOString()
  return Buffer.from(`${itemId}:${ts}`).toString('base64')
}

/**
 * Parse cursor to get item ID and timestamp
 */
export function parseCursor(cursor: string): { itemId: string; timestamp: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
    const firstColonIndex = decoded.indexOf(':')
    if (firstColonIndex === -1) return null
    const itemId = decoded.slice(0, firstColonIndex)
    const timestamp = decoded.slice(firstColonIndex + 1)
    if (!itemId || !timestamp) return null
    return { itemId, timestamp }
  } catch {
    return null
  }
}

// ============================================================================
// Virtual Scrolling
// ============================================================================

/**
 * Calculate visible range for virtual scrolling
 */
export function calculateVirtualScrollRange(state: VirtualScrollState): VirtualScrollRange {
  const { scrollTop, containerHeight, itemHeight, totalItems, overscan } = state

  // Calculate visible indices
  const startIndex = Math.floor(scrollTop / itemHeight)
  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const endIndex = Math.min(startIndex + visibleCount, totalItems)

  // Apply overscan (render extra items above/below visible area)
  const overscanStart = Math.max(0, startIndex - overscan)
  const overscanEnd = Math.min(totalItems, endIndex + overscan)

  // Calculate heights
  const totalHeight = totalItems * itemHeight
  const paddingTop = overscanStart * itemHeight
  const paddingBottom = (totalItems - overscanEnd) * itemHeight

  return {
    startIndex: overscanStart,
    endIndex: overscanEnd,
    visibleCount,
    offsetTop: paddingTop,
    totalHeight,
    paddingTop,
    paddingBottom,
  }
}

/**
 * Get items to render for virtual scrolling
 */
export function getVirtualItems<T>(
  items: T[],
  range: VirtualScrollRange
): Array<{ item: T; index: number; style: { top: number; height: number } }> {
  const result: Array<{ item: T; index: number; style: { top: number; height: number } }> = []

  for (let i = range.startIndex; i < range.endIndex && i < items.length; i++) {
    result.push({
      item: items[i],
      index: i,
      style: {
        top: 0, // Relative positioning within container
        height: (range.totalHeight / items.length) || 200,
      },
    })
  }

  return result
}

/**
 * Calculate scroll position to show specific item
 */
export function getScrollPositionForItem(
  itemIndex: number,
  itemHeight: number,
  containerHeight: number
): number {
  // Center the item in the container
  const itemTop = itemIndex * itemHeight
  const centerOffset = (containerHeight - itemHeight) / 2
  return Math.max(0, itemTop - centerOffset)
}

/**
 * Check if we're near the bottom for infinite scroll trigger
 */
export function isNearBottom(
  scrollTop: number,
  containerHeight: number,
  totalHeight: number,
  threshold: number = 200
): boolean {
  return scrollTop + containerHeight >= totalHeight - threshold
}

/**
 * Estimate row count for grid layout
 */
export function estimateRowsInView(
  containerHeight: number,
  rowHeight: number,
  gap: number = 0
): number {
  return Math.ceil(containerHeight / (rowHeight + gap))
}

/**
 * Calculate items per row for grid layout
 */
export function calculateItemsPerRow(
  containerWidth: number,
  itemMinWidth: number,
  gap: number = 0
): number {
  return Math.floor((containerWidth + gap) / (itemMinWidth + gap))
}

// ============================================================================
// Infinite Scroll Helpers
// ============================================================================

/**
 * Create initial infinite scroll state
 */
export function createInfiniteScrollState<T>(): InfiniteScrollState {
  return {
    items: [] as T[],
    page: 1,
    hasMore: true,
    isLoading: false,
    error: null,
  }
}

/**
 * Merge new items into infinite scroll state
 */
export function appendInfiniteScrollItems<T>(
  state: InfiniteScrollState,
  newItems: T[],
  hasMore: boolean
): InfiniteScrollState {
  return {
    items: [...state.items as T[], ...newItems],
    page: state.page + 1,
    hasMore,
    isLoading: false,
    error: null,
  }
}

/**
 * Reset infinite scroll state
 */
export function resetInfiniteScroll(): InfiniteScrollState {
  return createInfiniteScrollState()
}

// ============================================================================
// URL State Management
// ============================================================================

/**
 * Parse pagination state from URL params
 */
export function paginationFromParams(params: URLSearchParams): Partial<PaginationState> {
  const state: Partial<PaginationState> = {}

  const page = params.get('page')
  if (page) {
    const pageNum = parseInt(page, 10)
    if (!isNaN(pageNum) && pageNum > 0) {
      state.currentPage = pageNum
    }
  }

  const size = params.get('size')
  if (size) {
    const sizeNum = parseInt(size, 10)
    if (PAGE_SIZE_OPTIONS.some(opt => opt.value === sizeNum)) {
      state.pageSize = sizeNum as PageSize
    }
  }

  return state
}

/**
 * Convert pagination state to URL params
 */
export function paginationToParams(state: PaginationState): URLSearchParams {
  const params = new URLSearchParams()

  if (state.currentPage > 1) {
    params.set('page', String(state.currentPage))
  }

  if (state.pageSize !== 24) {
    params.set('size', String(state.pageSize))
  }

  return params
}

/**
 * Merge pagination params with existing params
 */
export function mergePaginationParams(
  existingParams: URLSearchParams,
  paginationState: PaginationState
): URLSearchParams {
  const params = new URLSearchParams(existingParams)
  const paginationParams = paginationToParams(paginationState)

  // Remove old pagination params
  params.delete('page')
  params.delete('size')

  // Add new pagination params
  paginationParams.forEach((value, key) => {
    params.set(key, value)
  })

  return params
}

// ============================================================================
// Scroll Restoration
// ============================================================================

const SCROLL_POSITIONS_KEY = 'gpters-toolkit-scroll-positions'
const MAX_SAVED_POSITIONS = 50

/**
 * Save scroll position for a route
 */
export function saveScrollPosition(route: string, position: number): void {
  if (typeof window === 'undefined') return

  try {
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    const positions: Record<string, number> = stored ? JSON.parse(stored) : {}

    positions[route] = position

    // Limit stored positions
    const keys = Object.keys(positions)
    if (keys.length > MAX_SAVED_POSITIONS) {
      const keysToRemove = keys.slice(0, keys.length - MAX_SAVED_POSITIONS)
      keysToRemove.forEach(key => delete positions[key])
    }

    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get saved scroll position for a route
 */
export function getScrollPosition(route: string): number {
  if (typeof window === 'undefined') return 0

  try {
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    if (!stored) return 0
    const positions: Record<string, number> = JSON.parse(stored)
    return positions[route] || 0
  } catch {
    return 0
  }
}

/**
 * Clear scroll position for a route
 */
export function clearScrollPosition(route: string): void {
  if (typeof window === 'undefined') return

  try {
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    if (!stored) return
    const positions: Record<string, number> = JSON.parse(stored)
    delete positions[route]
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions))
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Responsive Helpers
// ============================================================================

/**
 * Get optimal page size based on screen size
 */
export function getResponsivePageSize(screenWidth: number): PageSize {
  if (screenWidth < 640) return 12  // Mobile
  if (screenWidth < 1024) return 24 // Tablet
  return 48 // Desktop
}

/**
 * Get optimal items per row based on screen size
 */
export function getResponsiveItemsPerRow(screenWidth: number): number {
  if (screenWidth < 640) return 1   // Mobile
  if (screenWidth < 1024) return 2  // Tablet
  if (screenWidth < 1280) return 3  // Desktop
  return 4 // Large desktop
}

// ============================================================================
// Performance Utilities
// ============================================================================

/**
 * Debounce scroll handler
 */
export function createScrollDebouncer(
  callback: (scrollTop: number) => void,
  delay: number = 16
): (scrollTop: number) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastScrollTop = 0

  return (scrollTop: number) => {
    lastScrollTop = scrollTop

    if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        callback(lastScrollTop)
        timeoutId = null
      }, delay)
    }
  }
}

/**
 * Throttle scroll handler for performance
 */
export function createScrollThrottler(
  callback: (scrollTop: number) => void,
  limit: number = 16
): (scrollTop: number) => void {
  let lastTime = 0
  let scheduledScrollTop = 0
  let rafId: number | null = null

  return (scrollTop: number) => {
    const now = Date.now()
    scheduledScrollTop = scrollTop

    if (now - lastTime >= limit) {
      lastTime = now
      callback(scrollTop)
    } else if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        lastTime = Date.now()
        callback(scheduledScrollTop)
        rafId = null
      })
    }
  }
}
