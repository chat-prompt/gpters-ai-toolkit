/**
 * Visibility badge component for displaying item visibility level
 *
 * Shows visibility status (private/shared/public) with appropriate
 * icon and color coding for catalog items.
 */

/**
 * Props for the VisibilityBadge component
 */
interface VisibilityBadgeProps {
  /** Visibility level (null for legacy items) */
  visibility: 'private' | 'shared' | 'public' | null
  /** Badge size variant */
  size?: 'sm' | 'md'
  /** Additional CSS classes */
  className?: string
}

/**
 * Displays visibility level badge for catalog items
 *
 * Shows color-coded badges with icons for different visibility levels:
 * - Private: Gray with lock icon
 * - Shared: Blue with people icon
 * - Public: Green with globe icon
 * - Legacy (null): No badge rendered
 *
 * @example
 * ```tsx
 * <VisibilityBadge visibility="private" size="sm" />
 * <VisibilityBadge visibility="shared" size="md" />
 * <VisibilityBadge visibility="public" />
 * ```
 */
export function VisibilityBadge({ visibility, size = 'sm', className = '' }: VisibilityBadgeProps) {
  const sizeClasses = size === 'md'
    ? 'text-xs px-3 py-1'
    : 'text-[10px] px-2 py-0.5'

  // Legacy items (no visibility setting)
  if (!visibility) {
    return null
  }

  // Private visibility
  if (visibility === 'private') {
    return (
      <span className={`${sizeClasses} rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30 font-medium tracking-wide flex items-center gap-1.5 ${className}`}>
        🔒 Private
      </span>
    )
  }

  // Shared visibility
  if (visibility === 'shared') {
    return (
      <span className={`${sizeClasses} rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium tracking-wide flex items-center gap-1.5 ${className}`}>
        👥 Shared
      </span>
    )
  }

  // Public visibility
  return (
    <span className={`${sizeClasses} rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium tracking-wide flex items-center gap-1.5 ${className}`}>
      🌍 Public
    </span>
  )
}
