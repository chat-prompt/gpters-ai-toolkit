/**
 * Skeleton loading components for content placeholders
 *
 * A collection of skeleton components for displaying loading states.
 * Includes variants for different UI elements like cards, text, headers, etc.
 */

/**
 * Props for basic skeleton components
 */
interface SkeletonProps {
  /** Additional CSS classes */
  className?: string
}

/**
 * Base skeleton element with pulse animation
 *
 * @example
 * ```tsx
 * <Skeleton className="w-32 h-4" />
 * ```
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--bg-tertiary)] ${className}`}
      aria-hidden="true"
    />
  )
}

/**
 * Skeleton placeholder for card components
 *
 * Displays a card-shaped skeleton with icon, title, and description placeholders.
 */
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`glass rounded-xl p-5 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="w-6 h-6 rounded" />
        <Skeleton className="w-12 h-3" />
      </div>
      <Skeleton className="h-5 w-3/4 mb-2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3 mt-1" />
    </div>
  )
}

/**
 * Skeleton placeholder for text blocks
 *
 * @param lines - Number of text lines to display
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton placeholder for page header
 *
 * Consistent header skeleton used across all pages during loading.
 */
export function SkeletonHeader() {
  return (
    <header
      className="relative z-20 glass border-b border-[var(--border-subtle)]"
      aria-hidden="true"
    >
      <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
        <Skeleton className="w-32 h-6" />
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-full" />
        </div>
      </div>
    </header>
  )
}

/**
 * Skeleton placeholder for detail page hero section
 *
 * Includes breadcrumb, title, description, and tag placeholders.
 */
export function SkeletonDetailHero() {
  return (
    <div className="mb-8" aria-hidden="true">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="w-16 h-4" />
        <Skeleton className="w-4 h-4" />
        <Skeleton className="w-24 h-4" />
      </div>
      {/* Title Section */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="w-8 h-8 rounded" />
        <Skeleton className="w-16 h-5 rounded-full" />
        <Skeleton className="w-12 h-5 rounded-full" />
      </div>
      <Skeleton className="w-3/4 h-10 mb-4" />
      <Skeleton className="w-full h-5 mb-2" />
      <Skeleton className="w-2/3 h-5" />
      {/* Meta tags */}
      <div className="flex flex-wrap gap-3 mt-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-20 h-6 rounded-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton placeholder for action/install cards
 *
 * Used for installation guides and action buttons.
 */
export function SkeletonActionCard() {
  return (
    <div className="glass rounded-2xl p-6" aria-hidden="true">
      <Skeleton className="w-24 h-5 mb-4" />
      <Skeleton className="w-full h-12 rounded-xl" />
    </div>
  )
}

/**
 * Skeleton placeholder for content sections
 *
 * Includes text and code block placeholders for main content areas.
 */
export function SkeletonContent() {
  return (
    <div className="glass rounded-2xl p-8" aria-hidden="true">
      <Skeleton className="w-32 h-6 mb-6" />
      <SkeletonText lines={5} />
      <div className="my-6">
        <Skeleton className="w-full h-32 rounded-xl" />
      </div>
      <SkeletonText lines={4} />
    </div>
  )
}

/**
 * Skeleton placeholder for list pages with filters and cards
 *
 * @param cardCount - Number of card skeletons to display
 */
export function SkeletonListPage({ cardCount = 6 }: { cardCount?: number }) {
  return (
    <div aria-hidden="true">
      {/* Hero */}
      <div className="max-w-3xl mb-12">
        <Skeleton className="w-48 h-4 mb-6" />
        <Skeleton className="w-96 h-12 mb-4" />
        <Skeleton className="w-64 h-12 mb-6" />
        <Skeleton className="w-full max-w-xl h-4 mb-2" />
        <Skeleton className="w-3/4 max-w-xl h-4" />
      </div>
      {/* Filters */}
      <div className="flex gap-3 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="w-20 h-8 rounded-full" />
        ))}
      </div>
      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton placeholder for data tables
 *
 * @param rows - Number of table rows to display
 * @param cols - Number of table columns to display
 */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass rounded-xl overflow-hidden" aria-hidden="true">
      {/* Header */}
      <div className="flex gap-4 p-4 bg-[var(--bg-tertiary)]">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 p-4 border-t border-[var(--border-subtle)]"
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={`h-4 flex-1 ${colIndex === cols - 1 ? 'w-1/2' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton placeholder for sidebar navigation
 *
 * Displays a search bar and navigation link placeholders.
 */
export function SkeletonSidebar() {
  return (
    <div className="w-64 space-y-4" aria-hidden="true">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton placeholder for avatar with text
 *
 * @param size - Avatar size variant (sm, md, lg)
 */
export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  }

  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <Skeleton className={`${sizeClasses[size]} rounded-full`} />
      <div className="flex-1">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}
