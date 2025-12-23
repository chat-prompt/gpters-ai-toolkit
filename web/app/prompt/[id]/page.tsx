import { getItemById, getCatalog } from '@/lib/catalog'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/types'
import { CopyButton } from '@/components/CopyButton'
import { InstallGuide } from '@/components/InstallGuide'
import { MarkdownContent } from '@/components/MarkdownContent'
import { DependencyDisplay } from '@/components/DependencyDisplay'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

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

        {/* Dependencies */}
        {item.dependencies && item.dependencies.length > 0 && (
          <DependencyDisplay dependencies={item.dependencies} />
        )}

        {/* Installation Guide */}
        <div className="mb-8">
          <InstallGuide
            itemId={item.id}
            itemType="prompt"
            content={item.content}
          />
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
            <MarkdownContent content={item.content} />
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
              <MarkdownContent content={item.readme} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
