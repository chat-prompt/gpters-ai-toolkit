/**
 * Package detail page
 *
 * Displays detailed information about a curated package bundle
 * including contained items, dependencies, and installation guide.
 */
import { setRequestLocale } from 'next-intl/server'
import { getPackageWithContents, getCatalog, getRelatedItems } from '@/lib/core/catalog'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ContentSection } from '@/components/detail/ContentSection'
import { DependencyDisplay } from '@/components/detail/DependencyDisplay'
import { ChangelogDisplay } from '@/components/detail/ChangelogDisplay'
import { TableOfContents, Section, type TocItem } from '@/components/detail/TableOfContents'
import { DraftBanner } from '@/components/detail/DraftBanner'
import { RelatedItems } from '@/components/detail/RelatedItems'
import { AdminEditButton } from '@/components/admin/AdminEditButton'
import { ItemCard } from '@/components/catalog/SearchableCatalog/ItemCard'
import { SectionHeader } from '@/components/catalog/SearchableCatalog/SectionHeader'
import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export async function generateStaticParams() {
  const catalog = await getCatalog()
  return catalog
    .filter(item => item.type === 'package')
    .map(item => ({ id: item.id }))
}

/**
 * 패키지 상세 페이지
 *
 * @param params - locale 과 항목 id 를 담은 라우트 파라미터
 */
export default async function PackagePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const item = await getPackageWithContents(id)

  if (!item || item.type !== 'package') {
    notFound()
  }

  // Fetch related items
  const relatedItems = await getRelatedItems(item.id, item.tags, item.authorId ?? null, 6)

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요' },
  ]

  if (item.packageContents && item.packageContents.length > 0) {
    tocItems.push({ id: 'contents', label: '포함 아이템' })
  }

  if (item.dependencies && item.dependencies.length > 0) {
    tocItems.push({ id: 'dependencies', label: '의존성' })
  }

  if (item.changelog) {
    tocItems.push({ id: 'changelog', label: '변경 이력' })
  }

  tocItems.push({ id: 'content', label: '설명' })

  if (item.readme) {
    tocItems.push({ id: 'readme', label: 'README' })
  }

  if (relatedItems.length > 0) {
    tocItems.push({ id: 'related', label: '관련 아이템' })
  }

  return (
    <DetailPageLayout>
      <TableOfContents items={tocItems} />

      {item.status === 'draft' && <DraftBanner />}

      <Section id="overview">
        <ItemHero
          type="package"
          itemId={item.id}
          name={item.name}
          description={item.description}
          authorName={item.authorName}
          tags={item.tags}
          difficulty={item.difficulty}
          updatedAt={item.updatedAt}
          status={item.status}
          version={item.version}
        />
      </Section>

      {/* Package Contents */}
      {item.packageContents && item.packageContents.length > 0 && (
        <Section id="contents" className="mb-8">
          <div className="mb-6">
            <SectionHeader
              title="포함 아이템"
              count={item.packageContents.length}
            />
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              이 패키지에 포함된 아이템들입니다. 각 아이템을 개별적으로 설치하거나, 전체 패키지를 한 번에 설치할 수 있습니다.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {item.packageContents.map((contentItem, i) => (
              <ItemCard key={contentItem.id} item={contentItem} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* Dependencies */}
      {item.dependencies && item.dependencies.length > 0 && (
        <Section id="dependencies">
          <DependencyDisplay dependencies={item.dependencies} />
        </Section>
      )}

      {/* Changelog */}
      {item.changelog && (
        <Section id="changelog">
          <ChangelogDisplay
            version={item.version}
            changelog={item.changelog}
            updatedAt={item.updatedAt}
          />
        </Section>
      )}

      {/* Package Description */}
      <Section id="content">
        <ContentSection title="패키지 설명" content={item.content} />
      </Section>

      {/* README */}
      {item.readme && (
        <Section id="readme">
          <ContentSection title="README.md" content={item.readme} />
        </Section>
      )}

      {/* Related Items */}
      {relatedItems.length > 0 && (
        <Section id="related">
          <RelatedItems
            items={relatedItems}
            currentItemTags={item.tags}
            currentItemAuthorId={item.authorId}
          />
        </Section>
      )}

      <AdminEditButton itemId={item.id} returnUrl={`/package/${item.id}`} />
    </DetailPageLayout>
  )
}
