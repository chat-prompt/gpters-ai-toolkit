/**
 * Privacy policy page
 *
 * Public page describing MCP data collection practices and opt-out methods.
 * Accessible without authentication.
 */
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { ServerHeader } from '@/components/layout/ServerHeader'

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'admin@example.com'

/**
 * Generates localized metadata for the privacy policy page
 *
 * @param params - Route params containing the locale
 * @returns Localized page metadata
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'privacy' })
  return { title: t('metadata.title'), description: t('metadata.description') }
}

/**
 * Privacy policy page component displaying data collection practices
 */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('privacy')

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
          {/* 1. Overview */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.overview.title')}</h2>
            <p>{t('sections.overview.p1', { siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'AI Toolkit' })}</p>
            <p className="mt-2">{t('sections.overview.p2')}</p>
          </section>

          {/* 2. Data Collected */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.collected.title')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-2 pr-4 text-[var(--text-primary)]">{t('sections.collected.columns.item')}</th>
                    <th className="text-left py-2 pr-4 text-[var(--text-primary)]">{t('sections.collected.columns.purpose')}</th>
                    <th className="text-left py-2 text-[var(--text-primary)]">{t('sections.collected.columns.retention')}</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-secondary)]">
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">mcp_audit_logs</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.auditLogs')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionAudit')}</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">mcp_sessions</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.sessions')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionSessions')}</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">skill_events</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.skillEvents')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionSkillEvents')}</td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs">gpters-analytics</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.analytics')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionAnalytics')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Not Collected */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.notCollected.title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {(t.raw('sections.notCollected.items') as string[]).map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          {/* 4. Opt-Out */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.optOut.title')}</h2>
            <p className="mb-3">
              {t('sections.optOut.description')}
            </p>
            <p className="mb-3">{t('sections.optOut.rateLimitNote')}</p>

            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('sections.optOut.exampleTitle')}</h3>
            <p className="mb-2 text-sm">
              {t('sections.optOut.exampleDesc', {
                settingsPath: '.claude/settings.json',
              })}
            </p>
            <pre className="bg-[var(--bg-secondary)] rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed">
{`{
  "mcpServers": {
    "gpters-ai-toolkit": {
      "type": "http",
      "url": "https://ai-toolkit.gpters.org/api/mcp",
      "headers": {
        "X-Analytics-Opt-Out": "true"
      }
    }
  }
}`}
            </pre>
          </section>

          {/* 5. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">{t('sections.contact.title')}</h2>
            <p>
              {t('sections.contact.descriptionPrefix')}{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--brand-primary)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              {t('sections.contact.descriptionSuffix')}
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
