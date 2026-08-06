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
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main max-w-[70ch]">
        <p className="eyebrow">{t('badge')}</p>
        <h1 className="page-title mt-2 mb-8">
          {t('title')} {t('titleHighlight')}
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
                className="text-[var(--text-primary)] underline underline-offset-4 hover:text-[var(--text-secondary)] transition-colors"
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
