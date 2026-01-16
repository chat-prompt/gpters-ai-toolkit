/**
 * Virtualized list and pagination components
 *
 * A collection of components for efficient rendering of large lists:
 * - PaginationControls: Full pagination UI with page numbers
 * - SimplePagination: Minimal prev/next pagination
 * - VirtualList: Virtualized scrolling for lists
 * - VirtualGrid: Virtualized scrolling for grids
 * - InfiniteScroll: Intersection observer based infinite loading
 * - LoadMoreButton: Manual load more trigger
 *
 * Also exports hooks:
 * - usePaginatedList: Hook for paginated data management
 * - useResponsivePagination: Hook for responsive page sizes
 */
'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import {
  PaginationState,
  PageInfo,
  VirtualScrollRange,
  PageSize,
  PAGE_SIZE_OPTIONS,
  paginateItems,
  getPageInfo,
  getPageNumbers,
  calculateVirtualScrollRange,
  isNearBottom,
  createScrollThrottler,
  getResponsivePageSize,
} from '@/lib/utils/pagination'

// ============================================================================
// Pagination Controls Component
// ============================================================================

/**
 * Props for the PaginationControls component
 */
interface PaginationControlsProps {
  pageInfo: PageInfo
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSize) => void
  showPageSize?: boolean
  showItemRange?: boolean
  compact?: boolean
}

/**
 * Full pagination controls with page numbers and size selector
 *
 * @example
 * ```tsx
 * <PaginationControls
 *   pageInfo={pageInfo}
 *   onPageChange={setPage}
 *   onPageSizeChange={setPageSize}
 * />
 * ```
 */
export function PaginationControls({
  pageInfo,
  onPageChange,
  onPageSizeChange,
  showPageSize = true,
  showItemRange = true,
  compact = false,
}: PaginationControlsProps) {
  const pageNumbers = getPageNumbers(pageInfo.currentPage, pageInfo.totalPages)

  return (
    <div className={`flex flex-wrap items-center gap-4 ${compact ? 'text-xs' : 'text-sm'}`}>
      {/* Item Range */}
      {showItemRange && pageInfo.totalItems > 0 && (
        <span className="text-[var(--text-muted)]">
          {pageInfo.startItem}-{pageInfo.endItem} / {pageInfo.totalItems}개
        </span>
      )}

      {/* Page Size Selector */}
      {showPageSize && (
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">표시:</span>
          <select
            value={pageInfo.pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] focus:border-[var(--accent-cyan)] outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Page Navigation */}
      {pageInfo.totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* Previous Button */}
          <button
            onClick={() => onPageChange(pageInfo.currentPage - 1)}
            disabled={!pageInfo.hasPrevPage}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              pageInfo.hasPrevPage
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]/40 cursor-not-allowed'
            }`}
            aria-label="이전 페이지"
          >
            ←
          </button>

          {/* Page Numbers */}
          {pageNumbers.map((pageNum, index) => (
            pageNum === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-[var(--text-muted)]">
                ...
              </span>
            ) : (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`min-w-[2rem] px-2 py-1.5 rounded-lg transition-colors ${
                  pageNum === pageInfo.currentPage
                    ? 'bg-[var(--accent-cyan)] text-black font-medium'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {pageNum}
              </button>
            )
          ))}

          {/* Next Button */}
          <button
            onClick={() => onPageChange(pageInfo.currentPage + 1)}
            disabled={!pageInfo.hasNextPage}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              pageInfo.hasNextPage
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]/40 cursor-not-allowed'
            }`}
            aria-label="다음 페이지"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Simple Pagination Component
// ============================================================================

/**
 * Props for the SimplePagination component
 */
interface SimplePaginationProps {
  /** Current page number (1-based) */
  currentPage: number
  /** Total number of pages */
  totalPages: number
  /** Callback when page changes */
  onPageChange: (page: number) => void
}

/**
 * Minimal pagination with prev/next buttons
 *
 * @example
 * ```tsx
 * <SimplePagination currentPage={1} totalPages={10} onPageChange={setPage} />
 * ```
 */
export function SimplePagination({
  currentPage,
  totalPages,
  onPageChange,
}: SimplePaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)] transition-colors"
      >
        이전
      </button>

      <span className="px-4 py-2 text-[var(--text-muted)]">
        {currentPage} / {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)] transition-colors"
      >
        다음
      </button>
    </div>
  )
}

// ============================================================================
// Virtual List Component
// ============================================================================

/**
 * Props for the VirtualList component
 */
interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[]
  /** Height of each item in pixels */
  itemHeight: number
  /** Height of the scroll container in pixels */
  containerHeight: number
  /** Number of items to render outside visible area */
  overscan?: number
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode
  /** Callback when scrolled near the end */
  onEndReached?: () => void
  /** Distance from end to trigger onEndReached (px) */
  endReachedThreshold?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Virtualized list for efficient rendering of large datasets
 *
 * Only renders visible items plus overscan buffer for smooth scrolling.
 *
 * @example
 * ```tsx
 * <VirtualList
 *   items={items}
 *   itemHeight={80}
 *   containerHeight={600}
 *   renderItem={(item, i) => <ItemRow item={item} key={i} />}
 * />
 * ```
 */
export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
  renderItem,
  onEndReached,
  endReachedThreshold = 200,
  className = '',
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [triggeredForItemsLength, setTriggeredForItemsLength] = useState<number | null>(null)

  // Automatically resets when items.length changes
  const hasTriggeredEnd = triggeredForItemsLength === items.length

  const range = useMemo((): VirtualScrollRange => {
    return calculateVirtualScrollRange({
      scrollTop,
      containerHeight,
      itemHeight,
      totalItems: items.length,
      overscan,
    })
  }, [scrollTop, containerHeight, itemHeight, items.length, overscan])

  const handleScroll = useMemo(
    () => createScrollThrottler((newScrollTop: number) => {
      setScrollTop(newScrollTop)

      // Check for end reached
      if (onEndReached && !hasTriggeredEnd) {
        const totalHeight = items.length * itemHeight
        if (isNearBottom(newScrollTop, containerHeight, totalHeight, endReachedThreshold)) {
          setTriggeredForItemsLength(items.length)
          onEndReached()
        }
      }
    }, 16),
    [onEndReached, hasTriggeredEnd, items.length, itemHeight, containerHeight, endReachedThreshold]
  )

  const visibleItems = useMemo(() => {
    return items.slice(range.startIndex, range.endIndex)
  }, [items, range.startIndex, range.endIndex])

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={(e) => handleScroll(e.currentTarget.scrollTop)}
    >
      <div style={{ height: range.totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${range.paddingTop}px)` }}>
          {visibleItems.map((item, i) => (
            <div
              key={range.startIndex + i}
              style={{ height: itemHeight }}
            >
              {renderItem(item, range.startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Virtual Grid Component
// ============================================================================

/**
 * Props for the VirtualGrid component
 */
interface VirtualGridProps<T> {
  /** Array of items to render */
  items: T[]
  /** Height of each row in pixels */
  rowHeight: number
  /** Height of the scroll container in pixels */
  containerHeight: number
  /** Number of items per row */
  itemsPerRow: number
  /** Gap between items in pixels */
  gap?: number
  /** Number of rows to render outside visible area */
  overscan?: number
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode
  /** Callback when scrolled near the end */
  onEndReached?: () => void
  /** Distance from end to trigger onEndReached (px) */
  endReachedThreshold?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Virtualized grid for efficient rendering of large datasets
 *
 * Renders items in a grid layout, only showing visible rows.
 *
 * @example
 * ```tsx
 * <VirtualGrid
 *   items={items}
 *   rowHeight={200}
 *   containerHeight={600}
 *   itemsPerRow={3}
 *   renderItem={(item, i) => <Card item={item} key={i} />}
 * />
 * ```
 */
export function VirtualGrid<T>({
  items,
  rowHeight,
  containerHeight,
  itemsPerRow,
  gap = 24,
  overscan = 2,
  renderItem,
  onEndReached,
  endReachedThreshold = 200,
  className = '',
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [triggeredForItemsLength, setTriggeredForItemsLength] = useState<number | null>(null)

  // Automatically resets when items.length changes
  const hasTriggeredEnd = triggeredForItemsLength === items.length

  const totalRows = Math.ceil(items.length / itemsPerRow)
  const effectiveRowHeight = rowHeight + gap

  const range = useMemo((): VirtualScrollRange => {
    return calculateVirtualScrollRange({
      scrollTop,
      containerHeight,
      itemHeight: effectiveRowHeight,
      totalItems: totalRows,
      overscan,
    })
  }, [scrollTop, containerHeight, effectiveRowHeight, totalRows, overscan])

  const handleScroll = useMemo(
    () => createScrollThrottler((newScrollTop: number) => {
      setScrollTop(newScrollTop)

      if (onEndReached && !hasTriggeredEnd) {
        const totalHeight = totalRows * effectiveRowHeight
        if (isNearBottom(newScrollTop, containerHeight, totalHeight, endReachedThreshold)) {
          setTriggeredForItemsLength(items.length)
          onEndReached()
        }
      }
    }, 16),
    [onEndReached, hasTriggeredEnd, totalRows, effectiveRowHeight, containerHeight, endReachedThreshold, items.length]
  )

  const visibleRows = useMemo(() => {
    const rows: Array<T[]> = []
    for (let rowIdx = range.startIndex; rowIdx < range.endIndex && rowIdx < totalRows; rowIdx++) {
      const startItemIdx = rowIdx * itemsPerRow
      const endItemIdx = Math.min(startItemIdx + itemsPerRow, items.length)
      rows.push(items.slice(startItemIdx, endItemIdx))
    }
    return rows
  }, [items, range.startIndex, range.endIndex, totalRows, itemsPerRow])

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={(e) => handleScroll(e.currentTarget.scrollTop)}
    >
      <div style={{ height: range.totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${range.paddingTop}px)` }}>
          {visibleRows.map((row, rowIdx) => (
            <div
              key={range.startIndex + rowIdx}
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${itemsPerRow}, 1fr)`,
                gap: `${gap}px`,
                height: rowHeight,
                marginBottom: gap,
              }}
            >
              {row.map((item, colIdx) => {
                const itemIndex = (range.startIndex + rowIdx) * itemsPerRow + colIdx
                return (
                  <div key={itemIndex}>
                    {renderItem(item, itemIndex)}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Infinite Scroll Container
// ============================================================================

/**
 * Props for the InfiniteScroll component
 */
interface InfiniteScrollProps {
  /** Content to render */
  children: React.ReactNode
  /** Whether more items can be loaded */
  hasMore: boolean
  /** Whether currently loading */
  isLoading: boolean
  /** Callback to load more items */
  onLoadMore: () => void
  /** Intersection observer root margin (px) */
  threshold?: number
  /** Custom loading indicator */
  loader?: React.ReactNode
  /** Message when all items loaded */
  endMessage?: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

/**
 * Infinite scroll container using Intersection Observer
 *
 * Automatically loads more items when scrolled near the bottom.
 *
 * @example
 * ```tsx
 * <InfiniteScroll
 *   hasMore={hasNextPage}
 *   isLoading={isLoading}
 *   onLoadMore={fetchNextPage}
 * >
 *   {items.map(item => <Item key={item.id} {...item} />)}
 * </InfiniteScroll>
 * ```
 */
export function InfiniteScroll({
  children,
  hasMore,
  isLoading,
  onLoadMore,
  threshold = 200,
  loader,
  endMessage,
  className = '',
}: InfiniteScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sentinelRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore()
        }
      },
      {
        root: containerRef.current,
        rootMargin: `${threshold}px`,
        threshold: 0,
      }
    )

    observerRef.current.observe(sentinelRef.current)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [hasMore, isLoading, onLoadMore, threshold])

  return (
    <div ref={containerRef} className={`overflow-auto ${className}`}>
      {children}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-8">
          {loader || (
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <div className="w-4 h-4 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">로딩 중...</span>
            </div>
          )}
        </div>
      )}

      {/* End message */}
      {!hasMore && !isLoading && endMessage && (
        <div className="flex justify-center py-8 text-[var(--text-muted)] text-sm">
          {endMessage}
        </div>
      )}

      {/* Sentinel element for intersection observer */}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  )
}

// ============================================================================
// Paginated List Hook
// ============================================================================

/**
 * Options for the usePaginatedList hook
 */
interface UsePaginatedListOptions<T> {
  /** Full array of items */
  items: T[]
  /** Starting page number */
  initialPage?: number
  /** Starting page size */
  initialPageSize?: PageSize
  /** Callback when page changes */
  onPageChange?: (page: number) => void
  /** Callback when page size changes */
  onPageSizeChange?: (size: PageSize) => void
}

/**
 * Hook for managing paginated data
 *
 * @example
 * ```tsx
 * const { items, pageInfo, setPage, setPageSize } = usePaginatedList({
 *   items: allItems,
 *   initialPageSize: 24,
 * })
 * ```
 */
export function usePaginatedList<T>({
  items,
  initialPage = 1,
  initialPageSize = 24,
  onPageChange,
  onPageSizeChange,
}: UsePaginatedListOptions<T>) {
  const [pageState, setPageState] = useState({
    currentPage: initialPage,
    pageSize: initialPageSize,
  })

  // Derive pagination from page state and items.length
  const pagination = useMemo<PaginationState>(() => {
    const maxPage = Math.max(1, Math.ceil(items.length / pageState.pageSize))
    return {
      currentPage: Math.min(pageState.currentPage, maxPage),
      pageSize: pageState.pageSize,
      totalItems: items.length,
    }
  }, [pageState.currentPage, pageState.pageSize, items.length])

  const pageInfo = useMemo(() => getPageInfo(pagination), [pagination])

  const paginatedItems = useMemo(() => {
    return paginateItems(items, pagination.currentPage, pagination.pageSize)
  }, [items, pagination.currentPage, pagination.pageSize])

  const setPage = useCallback((page: number) => {
    setPageState((prev) => ({
      ...prev,
      currentPage: page,
    }))
    onPageChange?.(page)
  }, [onPageChange])

  const setPageSize = useCallback((size: PageSize) => {
    setPageState((prev) => ({
      ...prev,
      pageSize: size,
      currentPage: 1, // Reset to first page on size change
    }))
    onPageSizeChange?.(size)
  }, [onPageSizeChange])

  return {
    items: paginatedItems.items,
    pageInfo,
    pagination: paginatedItems.pagination,
    setPage,
    setPageSize,
  }
}

// ============================================================================
// Responsive Pagination Hook
// ============================================================================

/**
 * Hook for responsive page size based on viewport width
 *
 * Automatically adjusts page size based on screen size.
 *
 * @example
 * ```tsx
 * const { pageSize, setPageSize } = useResponsivePagination()
 * ```
 */
export function useResponsivePagination(initialPageSize?: PageSize) {
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize || 24)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updatePageSize = () => {
      const responsiveSize = getResponsivePageSize(window.innerWidth)
      if (initialPageSize === undefined) {
        setPageSize(responsiveSize)
      }
    }

    updatePageSize()
    window.addEventListener('resize', updatePageSize)
    return () => window.removeEventListener('resize', updatePageSize)
  }, [initialPageSize])

  return { pageSize, setPageSize }
}

// ============================================================================
// Load More Button
// ============================================================================

/**
 * Props for the LoadMoreButton component
 */
interface LoadMoreButtonProps {
  /** Click handler to load more items */
  onClick: () => void
  /** Whether currently loading */
  isLoading: boolean
  /** Whether more items available */
  hasMore: boolean
  /** Number of items currently loaded */
  loadedCount: number
  /** Total number of items (for progress display) */
  totalCount?: number
}

/**
 * Manual load more button with progress indicator
 *
 * @example
 * ```tsx
 * <LoadMoreButton
 *   onClick={loadMore}
 *   isLoading={isLoading}
 *   hasMore={hasNext}
 *   loadedCount={items.length}
 *   totalCount={totalCount}
 * />
 * ```
 */
export function LoadMoreButton({
  onClick,
  isLoading,
  hasMore,
  loadedCount,
  totalCount,
}: LoadMoreButtonProps) {
  if (!hasMore) return null

  return (
    <div className="flex flex-col items-center gap-2 py-8">
      {totalCount && (
        <span className="text-xs text-[var(--text-muted)]">
          {loadedCount} / {totalCount}개 표시됨
        </span>
      )}
      <button
        onClick={onClick}
        disabled={isLoading}
        className="px-6 py-2.5 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            로딩 중...
          </>
        ) : (
          <>더 보기</>
        )}
      </button>
    </div>
  )
}
