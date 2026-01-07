/**
 * Playground page loading state
 *
 * Displays skeleton UI while playground editor is loading.
 */
import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Header Skeleton */}
      <header className="relative z-20 glass border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <Skeleton className="w-32 h-6" />
          <div className="flex items-center gap-4">
            <Skeleton className="w-20 h-8 rounded-lg" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-8">
        {/* Toolbar Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Skeleton className="w-40 h-8" />
            <Skeleton className="w-24 h-6 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="w-24 h-8 rounded-lg" />
            <Skeleton className="w-32 h-8 rounded-lg" />
          </div>
        </div>

        {/* Two-column Layout Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor Panel */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="w-24 h-5" />
              <div className="flex items-center gap-2">
                <Skeleton className="w-16 h-6 rounded" />
                <Skeleton className="w-16 h-6 rounded" />
              </div>
            </div>
            <Skeleton className="w-full h-[400px] rounded-xl" />
          </div>

          {/* Preview Panel */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="w-20 h-5" />
              <Skeleton className="w-24 h-6 rounded" />
            </div>
            <div className="space-y-4">
              <Skeleton className="w-full h-24 rounded-xl" />
              <Skeleton className="w-full h-32 rounded-xl" />
              <Skeleton className="w-3/4 h-20 rounded-xl" />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
