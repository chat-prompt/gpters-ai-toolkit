import {
  SkeletonHeader,
  SkeletonDetailHero,
  SkeletonActionCard,
  SkeletonContent,
} from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <SkeletonHeader />

      <main className="relative z-10 max-w-4xl mx-auto px-8 py-12">
        <SkeletonDetailHero />
        <div className="mb-8">
          <SkeletonActionCard />
        </div>
        <SkeletonContent />
      </main>
    </div>
  )
}
