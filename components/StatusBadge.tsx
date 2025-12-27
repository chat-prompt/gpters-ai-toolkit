interface StatusBadgeProps {
  status?: 'draft' | 'published'
  version?: string
  className?: string
  size?: 'sm' | 'md'
}

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
