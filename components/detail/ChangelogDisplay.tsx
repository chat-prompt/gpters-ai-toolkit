interface ChangelogDisplayProps {
  version?: string
  changelog?: string
  updatedAt?: string
}

export function ChangelogDisplay({ version, changelog, updatedAt }: ChangelogDisplayProps) {
  if (!changelog && !version) return null

  return (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">📋</span>
        <h3 className="text-lg font-medium text-[var(--text-primary)]">
          {version ? `v${version}` : 'Latest'} Changes
        </h3>
        {updatedAt && (
          <span className="text-xs text-[var(--text-muted)]">
            {new Date(updatedAt).toLocaleDateString('ko-KR')}
          </span>
        )}
      </div>

      {changelog ? (
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-wrap">
          {changelog}
        </p>
      ) : (
        <p className="text-[var(--text-muted)] text-sm italic">
          No changelog available for this version.
        </p>
      )}
    </div>
  )
}
