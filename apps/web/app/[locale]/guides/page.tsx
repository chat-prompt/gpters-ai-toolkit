/**
 * 가이드 목록 페이지
 *
 * 바이브 코딩 설정 가이드를 모아 보여준다. 머리글은 제목·설명과 개수만
 * 두고, 나머지 세로 공간은 목록에 넘긴다.
 */
import { getGuides } from '@/lib/core/catalog'
import { ServerHeader } from '@/components/layout/ServerHeader'
import { Footer } from '@/components/layout/Footer'
import { SearchableGuides } from '@/components/guides/SearchableGuides'
import { getTranslations, setRequestLocale } from 'next-intl/server'

// Revalidate every 60 seconds
export const revalidate = 60

/**
 * 가이드 목록 페이지
 *
 * @param params - 로케일 라우트 파라미터
 */
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
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main">
        <header className="reveal mb-10 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="page-title">{t('hero.title')}</h1>
            <p className="page-subtitle whitespace-pre-line">{t('hero.description')}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
              {guides.length}
            </p>
            <p className="eyebrow mt-2">{t('hero.badge')}</p>
          </div>
        </header>

        <SearchableGuides guides={guides} />
      </main>

      <Footer />
    </div>
  )
}
