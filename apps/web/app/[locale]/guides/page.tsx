/**
 * Guides listing page
 *
 * Displays all available guides and tutorials for Claude Code
 * vibe coding techniques and best practices.
 */
import { getGuides } from '@/lib/core/catalog'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { SearchableGuides } from '@/components/guides/SearchableGuides'
import { getTranslations, setRequestLocale } from 'next-intl/server'

// Revalidate every 60 seconds
export const revalidate = 60

// Guides page for Vibe Coding tutorials
export default async function GuidesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('guides')
  const guides = await getGuides()

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-emerald-500 opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-500 opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      <main className="relative z-10 max-w-6xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📚</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              Guides
            </span>
          </div>

          <h1 className="text-5xl font-light text-[var(--text-primary)] tracking-tight mb-6" style={{ fontFamily: 'var(--font-newsreader)' }}>
            Vibe Coding Guides
          </h1>

          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl whitespace-pre-line">
            {t('hero.description')}
          </p>
        </div>

        {/* Stats */}
        <div className="mb-12 flex items-center gap-8">
          <div>
            <div className="text-3xl font-light text-[var(--text-primary)]">{guides.length}</div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Guides</div>
          </div>
        </div>

        {/* Searchable Guide List */}
        <SearchableGuides guides={guides} />
      </main>
    </div>
  )
}
