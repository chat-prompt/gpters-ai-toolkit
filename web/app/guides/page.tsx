import { getGuides } from '@/lib/catalog'
import { Header } from '@/components/Header'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/types'
import Link from 'next/link'

// Revalidate every 60 seconds
export const revalidate = 60

// Guides page for Vibe Coding tutorials
export default async function GuidesPage() {
  const guides = await getGuides()

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-emerald-500 opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-500 opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <Header />

      <main className="relative z-10 max-w-6xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📚</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              Guides
            </span>
          </div>

          <h1 className="text-5xl font-light text-[var(--text-primary)] tracking-tight mb-6" style={{ fontFamily: 'Newsreader, serif' }}>
            Vibe Coding Guides
          </h1>

          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            바이브 코딩을 위한 실용적인 설정 가이드 모음입니다.
            <br />
            비개발자도 따라할 수 있는 단계별 안내를 제공합니다.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-12 flex items-center gap-8">
          <div>
            <div className="text-3xl font-light text-[var(--text-primary)]">{guides.length}</div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Guides</div>
          </div>
        </div>

        {/* Guide List */}
        {guides.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {guides.map((guide, index) => (
              <Link href={`/guides/${guide.id}`} key={guide.id}>
                <div
                  className="group glass rounded-2xl p-6 h-full flex flex-col transition-all duration-300 hover:translate-y-[-4px] group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] animate-fade-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg text-emerald-400">📚</span>
                      <span className="text-[10px] font-semibold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                        Guide
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {guide.estimatedTime && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                          ⏱ {guide.estimatedTime}
                        </span>
                      )}
                      {guide.difficulty && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                          {DIFFICULTY_LABELS[guide.difficulty].label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2 tracking-tight">
                    {guide.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-[var(--text-secondary)] mb-6 flex-grow line-clamp-2 leading-relaxed">
                    {guide.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {guide.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase tracking-wider"
                      >
                        {TAGS[tag]?.label || tag}
                      </span>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
                    <span className="text-xs text-[var(--text-muted)]">@{guide.author}</span>
                    <span className="text-[10px] text-emerald-400 font-medium tracking-wide">
                      READ GUIDE →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-32">
            <div className="text-6xl mb-6 opacity-20">📚</div>
            <p className="text-[var(--text-secondary)] text-lg mb-4">
              아직 가이드가 없습니다
            </p>
            <p className="text-[var(--text-muted)] text-sm">
              곧 유용한 가이드들이 추가될 예정입니다
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
