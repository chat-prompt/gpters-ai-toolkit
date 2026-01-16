/**
 * Version badge component
 *
 * Displays a version number with appropriate styling based on type
 * (current, latest, or update) and configurable size.
 */
import { useMemo } from 'react'
import { normalizeVersion, isValidVersion } from '@/lib/plugin/updates'
import type { VersionBadgeProps } from './types'

/**
 * Display a version number with appropriate styling
 */
export function VersionBadge({
  version,
  type = 'current',
  size = 'md',
  className = '',
}: VersionBadgeProps) {
  const normalizedVersion = useMemo(() => {
    return isValidVersion(version) ? normalizeVersion(version) : version
  }, [version])

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  const typeClasses = {
    current: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    latest: 'bg-green-500/20 text-green-400',
    update: 'bg-amber-500/20 text-amber-400',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-lg font-mono font-medium
        ${sizeClasses[size]}
        ${typeClasses[type]}
        ${className}
      `}
    >
      <span className="opacity-60">v</span>
      {normalizedVersion}
    </span>
  )
}
