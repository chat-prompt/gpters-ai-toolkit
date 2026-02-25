/**
 * Visibility badge component for displaying item visibility level
 *
 * Shows visibility status (private/public) with appropriate
 * icon and color coding for catalog items.
 */

/**
 * Props for the VisibilityBadge component
 */
interface VisibilityBadgeProps {
  /** Visibility level (null for legacy items) */
  visibility: 'private' | 'public' | null
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
 * - Public: Green with globe icon
 * - Legacy (null): No badge rendered
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

  // Public visibility
  return (
    <span className={`${sizeClasses} rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium tracking-wide flex items-center gap-1.5 ${className}`}>
      🌍 Public
    </span>
  )
}
