import { getUpdateTypeDescription } from '@/lib/plugin/updates'
import type { UpdateTypeBadgeProps } from './types'

/**
 * Display an update type badge (major, minor, patch)
 */
export function UpdateTypeBadge({
  type,
  size = 'md',
  showDescription = false,
  className = '',
}: UpdateTypeBadgeProps) {
  const config = {
    major: {
      label: 'MAJOR',
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: '⚠️',
    },
    minor: {
      label: 'MINOR',
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      icon: '✨',
    },
    patch: {
      label: 'PATCH',
      color: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: '🔧',
    },
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  const { label, color, icon } = config[type]

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`
          inline-flex items-center gap-1 rounded-md font-medium border
          ${sizeClasses[size]}
          ${color}
        `}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {showDescription && (
        <span className="text-xs text-[var(--text-muted)]">
          {getUpdateTypeDescription(type)}
        </span>
      )}
    </div>
  )
}
