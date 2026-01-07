/**
 * Status badge component for displaying item status and version
 *
 * Shows version badges and draft status indicators for catalog items.
 */

/**
 * Props for the StatusBadge component
 */
interface StatusBadgeProps {
  /** The publication status of the item */
  status?: 'draft' | 'published'
  /** Version string to display (e.g., "1.0.0") */
  version?: string
  /** Additional CSS classes */
  className?: string
  /** Badge size variant */
  size?: 'sm' | 'md'
}

/**
 * Displays version and status badges for catalog items
 *
 * Shows a version badge with the item's version number and optionally
 * a draft indicator for unpublished items.
 *
 * @example
 * ```tsx
 * <StatusBadge version="1.2.0" status="draft" size="md" />
 * ```
 */
export function StatusBadge({ status, version, className = '', size = 'sm' }: StatusBadgeProps) {
  const sizeClasses = size === 'md'
    ? 'text-xs px-3 py-1.5'
    : 'text-[10px] px-2 py-1'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Version Badge */}
      {version && (
        <span className={`${sizeClasses} rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] font-mono`}>
          v{version}
        </span>
      )}

      {/* Status Badge */}
      {status === 'draft' && (
        <span className={`${sizeClasses} rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium flex items-center gap-1.5`}>
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          Draft
        </span>
      )}
    </div>
  )
}
