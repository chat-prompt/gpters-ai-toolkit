/**
 * Command detail page
 *
 * Displays detailed information about a specific slash command including
 * content, installation guide, usage examples, and related items.
 */
import { setRequestLocale } from 'next-intl/server'
import { getItemById, getRelatedItems } from '@/lib/core/catalog'
import { parseExamplesFromContent } from '@/lib/search/parse-examples'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ContentSection } from '@/components/detail/ContentSection'
import { DependencyDisplay } from '@/components/detail/DependencyDisplay'
import { ChangelogDisplay } from '@/components/detail/ChangelogDisplay'
import { TableOfContents, Section, type TocItem } from '@/components/detail/TableOfContents'
import { DraftBanner } from '@/components/detail/DraftBanner'
import { RelatedItems } from '@/components/detail/RelatedItems'
import { ExamplesSection } from '@/components/detail/ExamplesSection'
import { AdminEditButton } from '@/components/admin/AdminEditButton'
import { auth } from '@/lib/core/auth'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * 커맨드 상세 페이지
 *
 * @param params - locale 과 항목 id 를 담은 라우트 파라미터
 */
export default async function CommandPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [item, session] = await Promise.all([getItemById(id), auth()])

  if (!item || item.type !== 'command') {
    notFound()
  }

  // Fetch related items
  const relatedItems = await getRelatedItems(item.id, item.tags, item.authorId ?? null, 6)

  // Check for examples in content
  const hasExamples = parseExamplesFromContent(item.content).length > 0

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요' },
  ]

  if (hasExamples) {
    tocItems.push({ id: 'examples', label: '사용 예시' })
  }

  if (item.dependencies && item.dependencies.length > 0) {
    tocItems.push({ id: 'dependencies', label: '의존성' })
  }

  if (item.changelog) {
    tocItems.push({ id: 'changelog', label: '변경 이력' })
  }

  tocItems.push({ id: 'content', label: 'command.md' })

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
          type="command"
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

      {/* Examples */}
      {hasExamples && (
        <Section id="examples">
          <ExamplesSection content={item.content} />
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


      {/* Command Content */}
      <Section id="content">
        <ContentSection title="command.md" content={item.content} />
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

      {/* Admin Edit Button */}
      <AdminEditButton itemId={item.id} returnUrl={`/command/${item.id}`} />
    </DetailPageLayout>
  )
}
