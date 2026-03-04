/**
 * Home page
 *
 * Main landing page displaying the searchable catalog of
 * skills, agents, commands, hooks, and guides.
 */
import { getCatalog } from '@/lib/core/catalog'
import { SearchableCatalog } from '@/components/catalog/SearchableCatalog'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { Footer } from '@/components/layout/Footer'
import { getTranslations, setRequestLocale } from 'next-intl/server'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')
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
            <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-6">
              {t('hero.badge')}
            </p>
            <h2 className="text-5xl md:text-6xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-6" style={{ fontFamily: 'var(--font-newsreader)' }}>
              {t('hero.titleLine1')}
              <br />
              <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">{t('hero.titleLine2')}</span>
            </h2>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl whitespace-pre-line">
              {t('hero.description')}
            </p>
          </div>

          <SearchableCatalog catalog={catalog} />
        </div>
      </section>

      <Footer />
    </div>
  )
}
