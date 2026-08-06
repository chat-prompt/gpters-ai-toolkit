/**
 * Statistics page - Welfare Engine Dashboard (Admin only)
 *
 * Admin-restricted analytics dashboard displaying welfare engine metrics:
 * skill accumulation, utilization, and quality metrics.
 */
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { Footer } from '@/components/layout/Footer'
import { WelfareEngineDashboard } from '@/components/welfare-engine/WelfareEngineDashboard'
import type { UserRole } from '@/lib/security/rbac'

/** Roles that can access the stats page */
const STATS_ROLES: UserRole[] = ['super_admin', 'admin', 'editor']

export const metadata = {
  title: '복리 엔진 - AI Toolkit',
  description: '스킬 축적, 활용, 품질 지표를 확인하세요',
}

export default async function StatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await auth()
  const userRole = session?.user?.role as UserRole | undefined

  if (!session?.user || !userRole || !STATS_ROLES.includes(userRole)) {
    redirect('/')
  }

  const t = await getTranslations('stats.page')

  return (
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main">
        <header className="mb-8">
          <p className="eyebrow">{t('badge')}</p>
          <h1 className="page-title mt-2">
            {t('title')} {t('titleHighlight')}
          </h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </header>

        <WelfareEngineDashboard />
      </main>

      <Footer label={t('footerLabel')} />
    </div>
  )
}
