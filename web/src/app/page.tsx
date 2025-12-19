import { getCatalog } from '@/lib/catalog'
import { SearchableCatalog } from '@/components/SearchableCatalog'
import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  const catalog = getCatalog()

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4">
              <Image
                src="/gpters-logo.svg"
                alt="GPTers"
                width={40}
                height={40}
                className="rounded-full"
              />
              <div>
                <h1 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                  GPTers AI Toolkit
                </h1>
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.15em]">
                  Team Catalog
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-4">
              <Link
                href="/upload"
                className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F26522] text-white text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02] shadow-lg shadow-orange-500/20"
              >
                <span>+</span>
                <span>Share</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl">
            <p className="text-[#F26522] text-xs font-medium uppercase tracking-[0.3em] mb-6">
              GPTers AI Automation Hub
            </p>
            <h2 className="text-5xl md:text-6xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-6" style={{ fontFamily: 'Newsreader, serif' }}>
              Discover & Share
              <br />
              <span className="bg-gradient-to-r from-[#F26522] to-[#FF8C42] bg-clip-text text-transparent font-medium">Claude Skills</span>
            </h2>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl">
              GPTers 팀원들이 만든 스킬, 에이전트, 프롬프트를 찾아보세요.
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
            GPTers AI Toolkit Catalog
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Built with Claude Code
          </p>
        </div>
      </footer>
    </div>
  )
}
