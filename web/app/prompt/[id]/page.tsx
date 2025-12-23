import { getItemById, getCatalog } from '@/lib/catalog'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/types'
import { CopyButton } from '@/components/CopyButton'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  const catalog = await getCatalog()
  return catalog
    .filter(item => item.type === 'prompt')
    .map(item => ({ id: item.id }))
}

export default async function PromptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getItemById(id)

  if (!item || item.type !== 'prompt') {
    notFound()
  }

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-orange)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-8 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
          >
            <span>←</span>
            <span>Back to Catalog</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">✦</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-[var(--accent-orange)] uppercase">
              Prompt
            </span>
            {item.difficulty && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                {DIFFICULTY_LABELS[item.difficulty].label}
              </span>
            )}
          </div>

          <h1 className="text-4xl font-light text-[var(--text-primary)] tracking-tight mb-4" style={{ fontFamily: 'Newsreader, serif' }}>
            {item.name}
          </h1>

          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mb-8">
            {item.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {item.tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                {TAGS[tag]?.label || tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
            <span>@{item.author}</span>
            {item.updatedAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                <span>Updated {item.updatedAt}</span>
              </>
            )}
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="glass rounded-2xl p-8 mb-8" style={{ boxShadow: '0 0 40px rgba(255, 107, 53, 0.15)' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">💡</span>
            <h2 className="text-lg font-medium text-[var(--text-primary)]">How to Use</h2>
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Copy this prompt template and paste it into your Claude conversation. Fill in the placeholders with your specific context.
          </p>

          <ol className="space-y-3 text-sm text-[var(--text-secondary)]">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-muted)] shrink-0">1</span>
              <span>Click the copy button below to copy the prompt</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-muted)] shrink-0">2</span>
              <span>Paste into Claude Code or Claude.ai</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-muted)] shrink-0">3</span>
              <span>Replace any <code className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-orange)]">[placeholders]</code> with your content</span>
            </li>
          </ol>
        </div>

        {/* Prompt Content */}
        <div className="glass rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-xl">📝</span>
              <h2 className="text-lg font-medium text-[var(--text-primary)]">Prompt Template</h2>
            </div>
            <CopyButton text={item.content} />
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
            <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {item.content}
            </pre>
          </div>
        </div>

        {/* README */}
        {item.readme && (
          <div className="glass rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="text-xl">📖</span>
                <h2 className="text-lg font-medium text-[var(--text-primary)]">README.md</h2>
              </div>
              <CopyButton text={item.readme} />
            </div>

            <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
              <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {item.readme}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
