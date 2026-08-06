/**
 * 가이드 상세 페이지
 *
 * 가이드 본문(markdown)과 변경 이력을 보여준다.
 */
import { setRequestLocale } from 'next-intl/server'
import { getGuideById } from '@/lib/core/catalog'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ChangelogDisplay } from '@/components/detail/ChangelogDisplay'
import { ContentSection } from '@/components/detail/ContentSection'
import { AdminEditButton } from '@/components/admin/AdminEditButton'
import { auth } from '@/lib/core/auth'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'

export const dynamic = 'force-dynamic'

/**
 * 가이드 상세 페이지
 *
 * @param params - 로케일·가이드 id 라우트 파라미터
 */
export default async function GuidePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [guide, session] = await Promise.all([getGuideById(id), auth()])

  if (!guide) {
    notFound()
  }

  return (
    <DetailPageLayout>
      {/* Back Navigation */}
      <nav className="mb-6">
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span aria-hidden>←</span>
          <span>가이드 목록</span>
        </Link>
      </nav>

      <ItemHero
        type="guide"
        itemId={guide.id}
        name={guide.name}
        description={guide.description}
        authorName={guide.authorName}
        tags={guide.tags}
        difficulty={guide.difficulty}
        estimatedTime={guide.estimatedTime}
        updatedAt={guide.updatedAt}
        status={guide.status}
        version={guide.version}
      />

      {/* Changelog */}
      {guide.changelog && (
        <ChangelogDisplay
          version={guide.version}
          changelog={guide.changelog}
          updatedAt={guide.updatedAt}
        />
      )}

      {/* 본문·README — 파일 이름이 곧 제목이다 */}
      <ContentSection title="guide.md" content={guide.content} />

      {guide.readme && <ContentSection title="README.md" content={guide.readme} />}

      {/* Admin Edit Button */}
      <AdminEditButton itemId={guide.id} returnUrl={`/guides/${guide.id}`} />
    </DetailPageLayout>
  )
}
