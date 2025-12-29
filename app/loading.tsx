import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
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

      {/* Hero Section Skeleton */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <Skeleton className="w-48 h-4 mb-6" />
            <Skeleton className="w-96 h-12 mb-4" />
            <Skeleton className="w-64 h-12 mb-6" />
            <Skeleton className="w-full max-w-xl h-4 mb-2" />
            <Skeleton className="w-3/4 max-w-xl h-4" />
          </div>

          {/* Filter Skeleton */}
          <div className="flex gap-3 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="w-20 h-8 rounded-full" />
            ))}
          </div>

          {/* Cards Grid Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
