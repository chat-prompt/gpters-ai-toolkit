/**
 * Update list component
 *
 * Displays a list of all available plugin updates with summary header,
 * major update warnings, "update all" action, and individual update cards.
 * Shows success state when all plugins are up to date.
 */
import { UpdateCard } from './UpdateCard'
import type { UpdateListProps } from './types'

/**
 * List of available updates
 */
export function UpdateList({
  result,
  onUpdateAll,
  onUpdateSingle,
  className = '',
}: UpdateListProps) {
  if (!result.hasUpdates) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-[var(--text-secondary)]">모든 플러그인이 최신 버전입니다</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          마지막 확인: {new Date(result.checkedAt).toLocaleString('ko-KR')}
        </p>
      </div>
    )
  }

  const majorUpdates = result.updates.filter((u) => u.updateType === 'major')

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          {result.updates.length}개 업데이트 가능
        </h2>
        {onUpdateAll && result.updates.length > 1 && (
          <button
            onClick={onUpdateAll}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity"
          >
            모두 업데이트
          </button>
        )}
      </div>

      {majorUpdates.length > 0 && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">
            ⚠️ {majorUpdates.length}개의 메이저 업데이트가 있습니다. 호환성을 확인하세요.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {result.updates.map((update) => (
          <UpdateCard key={update.id} update={update} onUpdate={onUpdateSingle} />
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center">
        마지막 확인: {new Date(result.checkedAt).toLocaleString('ko-KR')}
      </p>
    </div>
  )
}
