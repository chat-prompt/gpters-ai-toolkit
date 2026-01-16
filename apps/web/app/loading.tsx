/**
 * Root loading state component
 *
 * Displays skeleton UI with ambient gradients while the main
 * page content is loading via React Suspense.
 */
import { SkeletonHeader, SkeletonListPage } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <SkeletonHeader />

      {/* Hero Section Skeleton */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-7xl mx-auto">
          <SkeletonListPage cardCount={6} />
        </div>
      </section>
    </div>
  )
}
