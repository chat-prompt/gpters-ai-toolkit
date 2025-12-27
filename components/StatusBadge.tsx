interface StatusBadgeProps {
  status?: 'draft' | 'published'
  version?: string
  className?: string
}

export function StatusBadge({ status, version, className = '' }: StatusBadgeProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Version Badge */}
      {version && (
        <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] font-mono">
          v{version}
        </span>
      )}

      {/* Status Badge */}
      {status === 'draft' && (
        <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
          Draft
        </span>
      )}
    </div>
  )
}
