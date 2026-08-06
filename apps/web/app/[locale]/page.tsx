/**
 * 홈 — 스킬·에이전트·커맨드 카탈로그
 *
 * 히어로는 한 화면을 넘기지 않을 만큼만 두고, 검색창과 유형 필터가 바로
 * 이어지게 한다 — 이 화면에서 사람들이 가장 먼저 하는 일이 찾기이기 때문이다.
 */
import { getCatalog } from '@/lib/core/catalog'
import { SearchableCatalog } from '@/components/catalog/SearchableCatalog'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { Footer } from '@/components/layout/Footer'
import { getTranslations, setRequestLocale } from 'next-intl/server'

// Revalidate every 60 seconds
export const revalidate = 60

/**
 * 홈 페이지
 *
 * @param params - 로케일 라우트 파라미터
 */
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
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main">
        {/* 왼쪽 정렬 — 가운데 정렬 히어로를 쓰지 않는다 */}
        <header className="reveal max-w-2xl">
          <p className="eyebrow">{t('hero.badge')}</p>
          <h1 className="mt-3 text-3xl md:text-4xl font-medium tracking-tight leading-tight text-[var(--text-primary)]">
            {t('hero.titleLine1')}{' '}
            <span className="text-[var(--brand-primary)]">{t('hero.titleLine2')}</span>
          </h1>
          <p className="page-subtitle whitespace-pre-line">{t('hero.description')}</p>
        </header>

        <SearchableCatalog catalog={catalog} />
      </main>

      <Footer />
    </div>
  )
}
