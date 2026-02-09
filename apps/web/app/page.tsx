/**
 * Home page
 *
 * Main landing page displaying the searchable catalog of
 * skills, agents, commands, hooks, and guides.
 */
import { getCatalog } from '@/lib/core/catalog'
import { SearchableCatalog } from '@/components/catalog/SearchableCatalog'
import { ServerHeader } from '@/components/layout/ServerHeader'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function Home() {
  const catalog = await getCatalog()

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      {/* Hero Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl">
            <p className="text-[#F26522] text-xs font-medium uppercase tracking-[0.3em] mb-6">
              AI Automation Hub
            </p>
            <h2 className="text-5xl md:text-6xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-6" style={{ fontFamily: 'var(--font-newsreader)' }}>
              Discover & Share
              <br />
              <span className="bg-gradient-to-r from-[#F26522] to-[#FF8C42] bg-clip-text text-transparent font-medium">Claude Skills</span>
            </h2>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl">
              팀원들이 만든 스킬, 에이전트, 프롬프트를 찾아보세요.
              <br />
              플러그인으로 바로 설치하거나 복사해서 사용할 수 있습니다.
            </p>
          </div>

          <SearchableCatalog catalog={catalog} />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border-subtle)] py-8">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            AI Toolkit Catalog
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Built with Claude Code
          </p>
        </div>
      </footer>
    </div>
  )
}
