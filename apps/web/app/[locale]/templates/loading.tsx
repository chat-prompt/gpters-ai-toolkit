/**
 * Templates page loading state
 *
 * Displays spinner while templates content is loading.
 */
export default function Loading() {
  return (
    <div className="page-shell items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[var(--border-subtle)] border-t-[var(--text-primary)] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[var(--text-muted)] text-sm">템플릿 로딩 중...</p>
      </div>
    </div>
  )
}
