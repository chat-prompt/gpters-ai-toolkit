import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'

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
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8">
          <Skeleton className="w-16 h-4" />
          <Skeleton className="w-4 h-4" />
          <Skeleton className="w-24 h-4" />
        </div>

        {/* Title Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-8 h-8 rounded" />
            <Skeleton className="w-20 h-5 rounded-full" />
            <Skeleton className="w-12 h-5 rounded-full" />
          </div>
          <Skeleton className="w-3/4 h-10 mb-4" />
          <Skeleton className="w-full h-5 mb-2" />
          <Skeleton className="w-2/3 h-5" />
        </div>

        {/* Meta Info */}
        <div className="flex flex-wrap gap-3 mb-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-20 h-6 rounded-full" />
          ))}
        </div>

        {/* Command Usage Section */}
        <div className="glass rounded-2xl p-6 mb-8">
          <Skeleton className="w-32 h-5 mb-4" />
          <Skeleton className="w-full h-12 rounded-xl mb-4" />
          <Skeleton className="w-2/3 h-4" />
        </div>

        {/* Content Section */}
        <div className="glass rounded-2xl p-8">
          <Skeleton className="w-32 h-6 mb-6" />
          <SkeletonText lines={5} />
          <div className="my-6">
            <Skeleton className="w-full h-32 rounded-xl" />
          </div>
          <SkeletonText lines={4} />
        </div>
      </main>
    </div>
  )
}
