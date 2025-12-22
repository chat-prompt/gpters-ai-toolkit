import { getGuideById, getGuides } from '@/lib/catalog'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/types'
import { Header } from '@/components/Header'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  const guides = getGuides()
  return guides.map(guide => ({ id: guide.id }))
}

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guide = getGuideById(id)

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

          <h1 className="text-4xl font-light text-[var(--text-primary)] tracking-tight mb-4" style={{ fontFamily: 'Newsreader, serif' }}>
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
            <div
              className="text-[var(--text-secondary)] leading-relaxed guide-content"
              dangerouslySetInnerHTML={{ __html: formatGuideContent(guide.content) }}
            />
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
              <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {guide.readme}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function formatGuideContent(content: string): string {
  // Process tables first (before other transformations)
  const tableRegex = /\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/g
  let html = content.replace(tableRegex, (_, headerRow, bodyRows) => {
    const headers = headerRow.split('|').map((h: string) => h.trim()).filter(Boolean)
    const rows = bodyRows.trim().split('\n').map((row: string) =>
      row.split('|').map((cell: string) => cell.trim()).filter(Boolean)
    )

    const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join('')
    const bodyHtml = rows.map((row: string[]) =>
      `<tr>${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`
    ).join('')

    return `<div class="table-wrapper"><table class="guide-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
  })

  // Simple markdown-like formatting
  html = html
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-[var(--text-primary)] mt-8 mb-4">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-medium text-[var(--text-primary)] mt-10 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-medium text-[var(--text-primary)] mt-10 mb-6">$1</h1>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-[var(--bg-primary)] rounded-xl p-4 my-4 overflow-x-auto"><code class="text-sm text-emerald-400">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-emerald-400 text-sm">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[var(--text-primary)]">$1</strong>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">$1</a>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 mb-2">• $1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 mb-2"><span class="text-emerald-400 mr-2">$1.</span>$2</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mb-4">')

  return `<p class="mb-4">${html}</p>`
}
