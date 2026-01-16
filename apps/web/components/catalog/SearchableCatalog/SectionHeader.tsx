/**
 * Section header component for catalog item type groupings
 *
 * Displays a styled header with icon, title, count, and decorative line.
 */
import { memo } from 'react'
import type { SectionHeaderProps } from './types'

/**
 * Section header with icon, title, and item count
 *
 * @example
 * ```tsx
 * <SectionHeader icon="⚡" title="Skills" count={42} accentColor="text-cyan-400" />
 * ```
 */
export const SectionHeader = memo(function SectionHeader({
  icon,
  title,
  count,
  accentColor,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        <span className={`text-2xl ${accentColor}`}>{icon}</span>
        <div>
          <h2 className="text-xl font-medium text-[var(--text-primary)] tracking-tight">{title}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
            {count} items available
          </p>
        </div>
      </div>
      <div className="h-px flex-1 ml-8 bg-gradient-to-r from-[var(--border-subtle)] to-transparent" />
    </div>
  )
})
