import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-emerald-500 opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
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
        {/* Hero */}
        <div className="mb-12 text-center">
          <Skeleton className="w-24 h-8 rounded-full mx-auto mb-6" />
          <Skeleton className="w-32 h-12 mx-auto mb-6" />
          <Skeleton className="w-80 h-5 mx-auto" />
        </div>

        {/* Guides Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} className="h-40" />
          ))}
        </div>
      </main>
    </div>
  )
}
