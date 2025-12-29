import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
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

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {/* Hero Skeleton */}
        <div className="mb-16 text-center">
          <Skeleton className="w-64 h-8 rounded-full mx-auto mb-6" />
          <Skeleton className="w-48 h-12 mx-auto mb-6" />
          <Skeleton className="w-96 h-5 mx-auto mb-2" />
          <Skeleton className="w-72 h-5 mx-auto" />
        </div>

        {/* Learning Path Skeleton */}
        <section className="mb-16">
          <Skeleton className="w-32 h-8 mx-auto mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-6">
                <Skeleton className="w-10 h-10 rounded-full mb-4" />
                <Skeleton className="w-3/4 h-5 mb-2" />
                <Skeleton className="w-full h-4" />
                <Skeleton className="w-2/3 h-4 mt-1" />
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start Skeleton */}
        <section className="mb-16">
          <Skeleton className="w-24 h-8 mb-6" />
          <div className="glass rounded-2xl p-6">
            <Skeleton className="w-32 h-4 mb-4" />
            <Skeleton className="w-full h-12 rounded-xl mb-8" />
            <Skeleton className="w-40 h-4 mb-4" />
            <Skeleton className="w-full h-12 rounded-xl" />
          </div>
        </section>

        {/* Essentials Skeleton */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="w-32 h-8" />
            <Skeleton className="w-28 h-4" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
