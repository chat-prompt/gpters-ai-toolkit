import { getGuideById, getGuides } from '@/lib/catalog'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/types'
import { Header } from '@/components/Header'
import { MarkdownContent } from '@/components/MarkdownContent'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export async function generateStaticParams() {
  const guides = await getGuides()
  return guides.map(guide => ({ id: guide.id }))
}

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guide = await getGuideById(id)

  if (!guide) {
    notFound()
  }

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-emerald-500 opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <Header />

      {/* Back Link */}
      <div className="relative z-10 max-w-5xl mx-auto px-8 pt-6">
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
        >
          <span>←</span>
          <span>Back to Guides</span>
        </Link>
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-8">
        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">📚</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              Guide
            </span>
            {guide.difficulty && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                {DIFFICULTY_LABELS[guide.difficulty].label}
              </span>
            )}
            {guide.estimatedTime && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                ⏱ {guide.estimatedTime}
              </span>
            )}
          </div>

          <h1 className="text-4xl font-light text-[var(--text-primary)] tracking-tight mb-4" style={{ fontFamily: 'var(--font-newsreader)' }}>
            {guide.name}
          </h1>

          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mb-8">
            {guide.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {guide.tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                {TAGS[tag]?.label || tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
            <span>@{guide.author}</span>
            {guide.updatedAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                <span>Updated {guide.updatedAt}</span>
              </>
            )}
          </div>
        </div>

        {/* Guide Content */}
        <div className="glass rounded-2xl p-8 mb-8" style={{ boxShadow: '0 0 30px rgba(16,185,129,0.1)' }}>
          <article className="prose prose-invert prose-emerald max-w-none">
            <MarkdownContent content={guide.content} />
          </article>
        </div>

        {/* README */}
        {guide.readme && (
          <div className="glass rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-xl">📖</span>
              <h2 className="text-lg font-medium text-[var(--text-primary)]">추가 정보</h2>
            </div>

            <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
              <MarkdownContent content={guide.readme} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
