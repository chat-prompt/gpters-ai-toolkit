/**
 * Command detail page loading state
 *
 * Displays a centered spinner while command detail content is loading.
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[var(--border-subtle)] border-t-[var(--accent-cyan)] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[var(--text-muted)] text-sm">로딩 중...</p>
      </div>
    </div>
  )
}
