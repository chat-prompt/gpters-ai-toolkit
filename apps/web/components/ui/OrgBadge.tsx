/**
 * Organization badge component for displaying organization ownership
 *
 * Shows organization name with building icon for org-owned items,
 * or "Legacy" badge for items without organization ownership.
 */

/**
 * Props for the OrgBadge component
 */
interface OrgBadgeProps {
  /** Organization name (null for legacy items) */
  orgName: string | null
  /** Organization slug for potential linking */
  orgSlug?: string
  /** Badge size variant */
  size?: 'sm' | 'md'
  /** Additional CSS classes */
  className?: string
}

/**
 * Displays organization ownership badge for catalog items
 *
 * Shows a cyan badge with building icon for org-owned items,
 * or a gray "Legacy" badge for items without organization.
 *
 * @example
 * ```tsx
 * <OrgBadge orgName="GPTers" orgSlug="gpters" size="sm" />
 * <OrgBadge orgName={null} size="md" />
 * ```
 */
export function OrgBadge({ orgName, orgSlug, size = 'sm', className = '' }: OrgBadgeProps) {
  const sizeClasses = size === 'md'
    ? 'text-xs px-3 py-1'
    : 'text-[10px] px-2 py-0.5'

  // Legacy items (no organization)
  if (!orgName) {
    return (
      <span className={`${sizeClasses} rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/30 font-medium tracking-wide flex items-center gap-1.5 ${className}`}>
        Legacy
      </span>
    )
  }

  // Organization-owned items
  return (
    <span className={`${sizeClasses} rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30 font-medium tracking-wide flex items-center gap-1.5 ${className}`}>
      🏢 {orgName}
    </span>
  )
}
