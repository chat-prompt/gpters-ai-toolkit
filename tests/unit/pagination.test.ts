/**
 * Tests for Pagination and Virtual Scroll System
 * 페이지네이션 및 가상 스크롤 시스템 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getTotalPages,
  paginateItems,
  getPageNumbers,
  getPageInfo,
  validatePage,
  getAdjustedPage,
  createCursorPaginationState,
  updateCursorPagination,
  createCursor,
  parseCursor,
  calculateVirtualScrollRange,
  getVirtualItems,
  getScrollPositionForItem,
  isNearBottom,
  estimateRowsInView,
  calculateItemsPerRow,
  createInfiniteScrollState,
  appendInfiniteScrollItems,
  resetInfiniteScroll,
  paginationFromParams,
  paginationToParams,
  mergePaginationParams,
  getResponsivePageSize,
  getResponsiveItemsPerRow,
  createScrollDebouncer,
  createScrollThrottler,
  DEFAULT_PAGINATION_STATE,
  PAGE_SIZE_OPTIONS,
  PaginationState,
  VirtualScrollState,
  CursorPaginatedResult,
} from '@/lib/utils/pagination'

// Mock data for testing
const mockItems = Array.from({ length: 100 }, (_, i) => ({
  id: `item-${i}`,
  name: `Item ${i}`,
}))

// ============================================================================
// getTotalPages Tests
// ============================================================================

describe('getTotalPages', () => {
  it('should calculate pages correctly', () => {
    expect(getTotalPages(100, 10)).toBe(10)
    expect(getTotalPages(101, 10)).toBe(11)
    expect(getTotalPages(99, 10)).toBe(10)
  })

  it('should return at least 1 page for zero items', () => {
    expect(getTotalPages(0, 10)).toBe(1)
  })

  it('should handle single page', () => {
    expect(getTotalPages(5, 10)).toBe(1)
  })

  it('should handle exact division', () => {
    expect(getTotalPages(24, 12)).toBe(2)
    expect(getTotalPages(48, 24)).toBe(2)
  })
})

// ============================================================================
// paginateItems Tests
// ============================================================================

describe('paginateItems', () => {
  it('should return correct items for first page', () => {
    const result = paginateItems(mockItems, 1, 10)
    expect(result.items).toHaveLength(10)
    expect(result.items[0].id).toBe('item-0')
    expect(result.items[9].id).toBe('item-9')
  })

  it('should return correct items for middle page', () => {
    const result = paginateItems(mockItems, 5, 10)
    expect(result.items).toHaveLength(10)
    expect(result.items[0].id).toBe('item-40')
    expect(result.items[9].id).toBe('item-49')
  })

  it('should return correct items for last page', () => {
    const result = paginateItems(mockItems, 10, 10)
    expect(result.items).toHaveLength(10)
    expect(result.items[0].id).toBe('item-90')
  })

  it('should include correct pagination metadata', () => {
    const result = paginateItems(mockItems, 3, 10)
    expect(result.pagination.currentPage).toBe(3)
    expect(result.pagination.pageSize).toBe(10)
    expect(result.pagination.totalItems).toBe(100)
    expect(result.pagination.totalPages).toBe(10)
    expect(result.pagination.hasNextPage).toBe(true)
    expect(result.pagination.hasPrevPage).toBe(true)
    expect(result.pagination.startIndex).toBe(21)
    expect(result.pagination.endIndex).toBe(30)
  })

  it('should handle first page hasNextPage/hasPrevPage', () => {
    const result = paginateItems(mockItems, 1, 10)
    expect(result.pagination.hasNextPage).toBe(true)
    expect(result.pagination.hasPrevPage).toBe(false)
  })

  it('should handle last page hasNextPage/hasPrevPage', () => {
    const result = paginateItems(mockItems, 10, 10)
    expect(result.pagination.hasNextPage).toBe(false)
    expect(result.pagination.hasPrevPage).toBe(true)
  })

  it('should handle empty array', () => {
    const result = paginateItems([], 1, 10)
    expect(result.items).toHaveLength(0)
    expect(result.pagination.totalItems).toBe(0)
    expect(result.pagination.totalPages).toBe(1)
  })

  it('should constrain page number to valid range', () => {
    const result = paginateItems(mockItems, 100, 10)
    expect(result.pagination.currentPage).toBe(10) // Last page
  })

  it('should handle page 0 as page 1', () => {
    const result = paginateItems(mockItems, 0, 10)
    expect(result.pagination.currentPage).toBe(1)
  })
})

// ============================================================================
// getPageNumbers Tests
// ============================================================================

describe('getPageNumbers', () => {
  it('should return all pages when total is small', () => {
    expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('should return ellipsis for large page counts', () => {
    const numbers = getPageNumbers(5, 20)
    expect(numbers).toContain(1)
    expect(numbers).toContain('ellipsis')
    expect(numbers).toContain(20)
  })

  it('should show pages around current', () => {
    const numbers = getPageNumbers(10, 20)
    expect(numbers).toContain(9)
    expect(numbers).toContain(10)
    expect(numbers).toContain(11)
  })

  it('should handle first page', () => {
    const numbers = getPageNumbers(1, 20)
    expect(numbers[0]).toBe(1)
    expect(numbers).toContain(20)
  })

  it('should handle last page', () => {
    const numbers = getPageNumbers(20, 20)
    expect(numbers).toContain(1)
    expect(numbers[numbers.length - 1]).toBe(20)
  })
})

// ============================================================================
// getPageInfo Tests
// ============================================================================

describe('getPageInfo', () => {
  it('should return complete page info', () => {
    const state: PaginationState = {
      currentPage: 3,
      pageSize: 24,
      totalItems: 100,
    }
    const info = getPageInfo(state)

    expect(info.currentPage).toBe(3)
    expect(info.totalPages).toBe(5) // ceil(100/24)
    expect(info.pageSize).toBe(24)
    expect(info.totalItems).toBe(100)
    expect(info.startItem).toBe(49) // (3-1)*24 + 1
    expect(info.endItem).toBe(72) // 3*24
    expect(info.hasNextPage).toBe(true)
    expect(info.hasPrevPage).toBe(true)
  })

  it('should handle zero items', () => {
    const state: PaginationState = {
      currentPage: 1,
      pageSize: 24,
      totalItems: 0,
    }
    const info = getPageInfo(state)

    expect(info.startItem).toBe(0)
    expect(info.endItem).toBe(0)
    expect(info.totalPages).toBe(1)
  })
})

// ============================================================================
// validatePage Tests
// ============================================================================

describe('validatePage', () => {
  it('should return valid page number', () => {
    expect(validatePage(5, 10)).toBe(5)
  })

  it('should constrain to minimum 1', () => {
    expect(validatePage(0, 10)).toBe(1)
    expect(validatePage(-5, 10)).toBe(1)
  })

  it('should constrain to maximum total', () => {
    expect(validatePage(15, 10)).toBe(10)
  })
})

// ============================================================================
// getAdjustedPage Tests
// ============================================================================

describe('getAdjustedPage', () => {
  it('should keep page if still valid', () => {
    expect(getAdjustedPage(3, 100, 100, 10)).toBe(3)
  })

  it('should adjust page when items decrease', () => {
    expect(getAdjustedPage(10, 100, 50, 10)).toBe(5)
  })

  it('should return 1 for empty list', () => {
    expect(getAdjustedPage(5, 100, 0, 10)).toBe(1)
  })
})

// ============================================================================
// Cursor Pagination Tests
// ============================================================================

describe('createCursorPaginationState', () => {
  it('should create initial state', () => {
    const state = createCursorPaginationState()
    expect(state.cursor).toBeNull()
    expect(state.hasMore).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(state.loadedCount).toBe(0)
  })
})

describe('updateCursorPagination', () => {
  it('should update state from result', () => {
    const state = createCursorPaginationState()
    const result: CursorPaginatedResult<unknown> = {
      items: [{}, {}],
      nextCursor: 'abc123',
      hasMore: true,
    }

    const updated = updateCursorPagination(state, result)

    expect(updated.cursor).toBe('abc123')
    expect(updated.hasMore).toBe(true)
    expect(updated.isLoading).toBe(false)
    expect(updated.loadedCount).toBe(2)
  })
})

describe('createCursor and parseCursor', () => {
  it('should create and parse cursor correctly', () => {
    const cursor = createCursor('item-123', '2025-01-15T12:00:00Z')
    const parsed = parseCursor(cursor)

    expect(parsed).not.toBeNull()
    expect(parsed?.itemId).toBe('item-123')
    expect(parsed?.timestamp).toBe('2025-01-15T12:00:00Z')
  })

  it('should return null for invalid cursor', () => {
    expect(parseCursor('invalid')).toBeNull()
  })
})

// ============================================================================
// Virtual Scroll Tests
// ============================================================================

describe('calculateVirtualScrollRange', () => {
  it('should calculate visible range', () => {
    const state: VirtualScrollState = {
      scrollTop: 0,
      containerHeight: 600,
      itemHeight: 100,
      totalItems: 100,
      overscan: 3,
    }

    const range = calculateVirtualScrollRange(state)

    expect(range.startIndex).toBe(0)
    expect(range.endIndex).toBe(9) // 6 visible + 3 overscan
    expect(range.visibleCount).toBe(6)
  })

  it('should handle scrolled position', () => {
    const state: VirtualScrollState = {
      scrollTop: 500,
      containerHeight: 600,
      itemHeight: 100,
      totalItems: 100,
      overscan: 3,
    }

    const range = calculateVirtualScrollRange(state)

    expect(range.startIndex).toBe(2) // 5 - 3 overscan
    expect(range.paddingTop).toBe(200) // startIndex * itemHeight
  })

  it('should not exceed total items', () => {
    const state: VirtualScrollState = {
      scrollTop: 9000,
      containerHeight: 600,
      itemHeight: 100,
      totalItems: 100,
      overscan: 3,
    }

    const range = calculateVirtualScrollRange(state)

    expect(range.endIndex).toBeLessThanOrEqual(100)
  })
})

describe('getVirtualItems', () => {
  it('should return items within range', () => {
    const items = mockItems.slice(0, 20)
    const range = {
      startIndex: 5,
      endIndex: 10,
      visibleCount: 5,
      offsetTop: 500,
      totalHeight: 2000,
      paddingTop: 500,
      paddingBottom: 1000,
    }

    const virtualItems = getVirtualItems(items, range)

    expect(virtualItems).toHaveLength(5)
    expect(virtualItems[0].index).toBe(5)
    expect(virtualItems[4].index).toBe(9)
  })
})

describe('getScrollPositionForItem', () => {
  it('should center item in container', () => {
    const position = getScrollPositionForItem(10, 100, 600)
    expect(position).toBe(750) // 10*100 - (600-100)/2
  })

  it('should not return negative position', () => {
    const position = getScrollPositionForItem(0, 100, 600)
    expect(position).toBe(0)
  })
})

describe('isNearBottom', () => {
  it('should detect near bottom', () => {
    expect(isNearBottom(900, 600, 1500, 200)).toBe(true)
    expect(isNearBottom(400, 600, 1500, 200)).toBe(false)
  })

  it('should handle exact bottom', () => {
    expect(isNearBottom(900, 600, 1500, 0)).toBe(true)
  })
})

describe('estimateRowsInView', () => {
  it('should calculate rows in view', () => {
    expect(estimateRowsInView(600, 100, 10)).toBe(6) // ceil(600/110)
  })
})

describe('calculateItemsPerRow', () => {
  it('should calculate items per row', () => {
    expect(calculateItemsPerRow(1200, 300, 24)).toBe(3) // floor(1224/324)
  })
})

// ============================================================================
// Infinite Scroll Tests
// ============================================================================

describe('createInfiniteScrollState', () => {
  it('should create initial state', () => {
    const state = createInfiniteScrollState()
    expect(state.items).toEqual([])
    expect(state.page).toBe(1)
    expect(state.hasMore).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })
})

describe('appendInfiniteScrollItems', () => {
  it('should append items', () => {
    const state = createInfiniteScrollState<{ id: number }>()
    const updated = appendInfiniteScrollItems(state, [{ id: 1 }, { id: 2 }], true)

    expect(updated.items).toHaveLength(2)
    expect(updated.page).toBe(2)
    expect(updated.hasMore).toBe(true)
  })

  it('should preserve existing items', () => {
    let state = createInfiniteScrollState<{ id: number }>()
    state = appendInfiniteScrollItems(state, [{ id: 1 }], true)
    state = appendInfiniteScrollItems(state, [{ id: 2 }], false)

    expect(state.items).toHaveLength(2)
    expect(state.page).toBe(3)
    expect(state.hasMore).toBe(false)
  })
})

describe('resetInfiniteScroll', () => {
  it('should return initial state', () => {
    const state = resetInfiniteScroll()
    expect(state.items).toEqual([])
    expect(state.page).toBe(1)
  })
})

// ============================================================================
// URL State Tests
// ============================================================================

describe('paginationFromParams', () => {
  it('should parse page from URL', () => {
    const params = new URLSearchParams('page=5')
    const state = paginationFromParams(params)
    expect(state.currentPage).toBe(5)
  })

  it('should parse size from URL', () => {
    const params = new URLSearchParams('size=48')
    const state = paginationFromParams(params)
    expect(state.pageSize).toBe(48)
  })

  it('should ignore invalid values', () => {
    const params = new URLSearchParams('page=abc&size=999')
    const state = paginationFromParams(params)
    expect(state.currentPage).toBeUndefined()
    expect(state.pageSize).toBeUndefined()
  })
})

describe('paginationToParams', () => {
  it('should serialize page > 1', () => {
    const state: PaginationState = { currentPage: 5, pageSize: 24, totalItems: 100 }
    const params = paginationToParams(state)
    expect(params.get('page')).toBe('5')
  })

  it('should not include page 1', () => {
    const state: PaginationState = { currentPage: 1, pageSize: 24, totalItems: 100 }
    const params = paginationToParams(state)
    expect(params.has('page')).toBe(false)
  })

  it('should serialize non-default page size', () => {
    const state: PaginationState = { currentPage: 1, pageSize: 48, totalItems: 100 }
    const params = paginationToParams(state)
    expect(params.get('size')).toBe('48')
  })
})

describe('mergePaginationParams', () => {
  it('should merge with existing params', () => {
    const existing = new URLSearchParams('q=search&filter=test')
    const state: PaginationState = { currentPage: 3, pageSize: 48, totalItems: 100 }

    const merged = mergePaginationParams(existing, state)

    expect(merged.get('q')).toBe('search')
    expect(merged.get('filter')).toBe('test')
    expect(merged.get('page')).toBe('3')
    expect(merged.get('size')).toBe('48')
  })
})

// ============================================================================
// Responsive Helpers Tests
// ============================================================================

describe('getResponsivePageSize', () => {
  it('should return small size for mobile', () => {
    expect(getResponsivePageSize(400)).toBe(12)
  })

  it('should return medium size for tablet', () => {
    expect(getResponsivePageSize(800)).toBe(24)
  })

  it('should return large size for desktop', () => {
    expect(getResponsivePageSize(1400)).toBe(48)
  })
})

describe('getResponsiveItemsPerRow', () => {
  it('should return 1 for mobile', () => {
    expect(getResponsiveItemsPerRow(400)).toBe(1)
  })

  it('should return 2 for tablet', () => {
    expect(getResponsiveItemsPerRow(800)).toBe(2)
  })

  it('should return 3 for desktop', () => {
    expect(getResponsiveItemsPerRow(1100)).toBe(3)
  })

  it('should return 4 for large desktop', () => {
    expect(getResponsiveItemsPerRow(1400)).toBe(4)
  })
})

// ============================================================================
// Performance Utilities Tests
// ============================================================================

describe('createScrollDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('should debounce scroll events', () => {
    const callback = vi.fn()
    const debounced = createScrollDebouncer(callback, 100)

    debounced(100)
    debounced(200)
    debounced(300)

    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(300)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})

describe('createScrollThrottler', () => {
  it('should call immediately on first scroll', () => {
    const callback = vi.fn()
    const throttled = createScrollThrottler(callback, 100)

    throttled(100)

    expect(callback).toHaveBeenCalledWith(100)
  })
})

// ============================================================================
// Constants Tests
// ============================================================================

describe('PAGE_SIZE_OPTIONS', () => {
  it('should have all required options', () => {
    const values = PAGE_SIZE_OPTIONS.map(o => o.value)
    expect(values).toContain(12)
    expect(values).toContain(24)
    expect(values).toContain(48)
    expect(values).toContain(96)
  })

  it('should have labels for all options', () => {
    PAGE_SIZE_OPTIONS.forEach(option => {
      expect(option.label).toBeDefined()
      expect(option.label.length).toBeGreaterThan(0)
    })
  })
})

describe('DEFAULT_PAGINATION_STATE', () => {
  it('should have correct defaults', () => {
    expect(DEFAULT_PAGINATION_STATE.currentPage).toBe(1)
    expect(DEFAULT_PAGINATION_STATE.pageSize).toBe(24)
    expect(DEFAULT_PAGINATION_STATE.totalItems).toBe(0)
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle single item', () => {
    const result = paginateItems([{ id: 1 }], 1, 10)
    expect(result.items).toHaveLength(1)
    expect(result.pagination.totalPages).toBe(1)
  })

  it('should handle large page size with few items', () => {
    const result = paginateItems(mockItems.slice(0, 5), 1, 100)
    expect(result.items).toHaveLength(5)
    expect(result.pagination.totalPages).toBe(1)
  })

  it('should handle virtual scroll with zero items', () => {
    const range = calculateVirtualScrollRange({
      scrollTop: 0,
      containerHeight: 600,
      itemHeight: 100,
      totalItems: 0,
      overscan: 3,
    })
    expect(range.startIndex).toBe(0)
    expect(range.endIndex).toBe(0)
    expect(range.totalHeight).toBe(0)
  })
})
