/**
 * Terms of service page
 *
 * Public page describing service usage terms and conditions.
 * Accessible without authentication.
 */
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { ServerHeader } from '@/components/layout/ServerHeader'

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'admin@example.com'

/**
 * Generates localized metadata for the terms of service page
 *
 * @param params - Route params containing the locale
 * @returns Localized page metadata
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'terms' })
  return { title: t('metadata.title'), description: t('metadata.description') }
}

/**
 * Terms of service page component
 */
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('terms')

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4">
          {t('badge')}
        </p>
        <h1
          className="text-4xl md:text-5xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-8"
          style={{ fontFamily: 'var(--font-newsreader)' }}
        >
          {t('title')}{' '}
          <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
            {t('titleHighlight')}
          </span>
        </h1>

        <div className="space-y-10 text-[var(--text-secondary)] leading-relaxed">
          {/* 1. Service Overview */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.overview.title')}</h2>
            <p>{t('sections.overview.content', { siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Toolkit' })}</p>
          </section>

          {/* 2. Usage Conditions */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.conditions.title')}</h2>
            <ul className="list-disc list-inside space-y-2">
              {(t.raw('sections.conditions.items') as string[]).map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          {/* 3. Content Rights */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.rights.title')}</h2>
            <p>{t('sections.rights.content')}</p>
          </section>

          {/* 4. Disclaimer */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.disclaimer.title')}</h2>
            <ul className="list-disc list-inside space-y-2">
              {(t.raw('sections.disclaimer.items') as string[]).map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          {/* 5. Account & Access */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.account.title')}</h2>
            <p>{t('sections.account.content')}</p>
          </section>

          {/* 6. Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.changes.title')}</h2>
            <p>{t('sections.changes.content')}</p>
          </section>

          {/* 7. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.contact.title')}</h2>
            <p>
              {t('sections.contact.contentPrefix')}{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--brand-primary)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              {t('sections.contact.contentSuffix')}
            </p>
          </section>

          <p className="text-xs text-[var(--text-muted)] pt-4 border-t border-[var(--border-subtle)]">
            {t('lastUpdated')}
          </p>
        </div>
      </main>
    </div>
  )
}
