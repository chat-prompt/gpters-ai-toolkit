/**
 * Profile page loading state
 *
 * Displays skeleton UI while user profile content is loading.
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

      <main className="relative z-10 max-w-4xl mx-auto px-8 py-12">
        {/* Profile Header */}
        <div className="glass rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-6">
            <Skeleton className="w-24 h-24 rounded-full" />
            <div className="flex-1">
              <Skeleton className="w-48 h-8 mb-2" />
              <Skeleton className="w-64 h-5 mb-4" />
              <div className="flex items-center gap-4">
                <Skeleton className="w-20 h-6 rounded-full" />
                <Skeleton className="w-32 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-xl p-6">
              <Skeleton className="w-16 h-10 mb-2" />
              <Skeleton className="w-24 h-4" />
            </div>
          ))}
        </div>

        {/* Activity Section */}
        <div className="glass rounded-2xl p-6">
          <Skeleton className="w-32 h-6 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)]">
                <Skeleton className="w-10 h-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="w-48 h-5 mb-2" />
                  <Skeleton className="w-32 h-4" />
                </div>
                <Skeleton className="w-20 h-4" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
