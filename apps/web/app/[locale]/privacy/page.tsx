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
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main max-w-[70ch]">
        <p className="eyebrow">{t('badge')}</p>
        <h1 className="page-title mt-2 mb-8">
          {t('title')} {t('titleHighlight')}
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
                <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">mcp_audit_logs</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.auditLogs')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionAudit')}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">mcp_sessions</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.sessions')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionSessions')}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">skill_events</td>
                    <td className="py-2 pr-4">{t('sections.collected.rows.skillEvents')}</td>
                    <td className="py-2">{t('sections.collected.rows.retentionSkillEvents')}</td>
                  </tr>
                  <tr>
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
            <pre className="bg-[var(--bg-tertiary)] rounded-lg p-4 overflow-x-auto text-xs font-mono leading-relaxed">
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
                className="text-[var(--text-primary)] underline underline-offset-4 hover:text-[var(--text-secondary)] transition-colors"
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
