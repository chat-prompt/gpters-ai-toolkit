import { getItemById, getCatalog, getRelatedItems } from '@/lib/catalog'
import { parseExamplesFromContent } from '@/lib/parse-examples'
import { DetailPageLayout } from '@/components/DetailPageLayout'
import { ItemHero } from '@/components/ItemHero'
import { ContentSection } from '@/components/ContentSection'
import { InstallGuide } from '@/components/InstallGuide'
import { DependencyDisplay } from '@/components/DependencyDisplay'
import { ChangelogDisplay } from '@/components/ChangelogDisplay'
import { TableOfContents, Section, type TocItem } from '@/components/TableOfContents'
import { DraftBanner } from '@/components/DraftBanner'
import { TryItButton } from '@/components/TryItButton'
import { DownloadButton } from '@/components/DownloadButton'
import { RelatedItems } from '@/components/RelatedItems'
import { ExamplesSection } from '@/components/ExamplesSection'
import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export async function generateStaticParams() {
  const catalog = await getCatalog()
  return catalog
    .filter(item => item.type === 'skill')
    .map(item => ({ id: item.id }))
}

export default async function SkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getItemById(id)

  if (!item || item.type !== 'skill') {
    notFound()
  }

  // Fetch related items
  const relatedItems = await getRelatedItems(item.id, item.tags, item.author, 6)

  // Check for examples in content
  const hasExamples = parseExamplesFromContent(item.content).length > 0

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요', icon: '📋' },
  ]

  if (hasExamples) {
    tocItems.push({ id: 'examples', label: '사용 예시', icon: '💡' })
  }

  if (item.dependencies && item.dependencies.length > 0) {
    tocItems.push({ id: 'dependencies', label: '의존성', icon: '🔗' })
  }

  if (item.changelog) {
    tocItems.push({ id: 'changelog', label: '변경 이력', icon: '📋' })
  }

  tocItems.push({ id: 'install', label: '설치 방법', icon: '📦' })
  tocItems.push({ id: 'content', label: 'skill.md', icon: '📄' })

  if (item.readme) {
    tocItems.push({ id: 'readme', label: 'README', icon: '📖' })
  }

  if (relatedItems.length > 0) {
    tocItems.push({ id: 'related', label: '관련 아이템', icon: '🔗' })
  }

  return (
    <DetailPageLayout accentColor="cyan">
      <TableOfContents items={tocItems} />

      {item.status === 'draft' && <DraftBanner />}

      <Section id="overview">
        <ItemHero
          type="skill"
          itemId={item.id}
          name={item.name}
          description={item.description}
          author={item.author}
          tags={item.tags}
          likes={item.likes}
          difficulty={item.difficulty}
          updatedAt={item.updatedAt}
          status={item.status}
          marketplaceVersion={item.marketplaceVersion}
          extraBadges={
            <>
              <TryItButton itemId={item.id} />
              <DownloadButton itemId={item.id} itemName={item.name} size="sm" />
            </>
          }
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
            version={item.marketplaceVersion}
            changelog={item.changelog}
            updatedAt={item.updatedAt}
          />
        </Section>
      )}

      {/* Installation Guide */}
      <Section id="install" className="mb-8">
        <InstallGuide
          itemId={item.id}
          itemType="skill"
          pluginId={item.pluginId}
          content={item.content}
          marketplaceEnabled={item.marketplaceEnabled}
        />
      </Section>

      {/* Skill Content */}
      <Section id="content">
        <ContentSection title="skill.md" content={item.content} />
      </Section>

      {/* README */}
      {item.readme && (
        <Section id="readme">
          <ContentSection title="README.md" icon="📖" content={item.readme} />
        </Section>
      )}

      {/* Related Items */}
      {relatedItems.length > 0 && (
        <Section id="related">
          <RelatedItems
            items={relatedItems}
            currentItemTags={item.tags}
            currentItemAuthor={item.author}
          />
        </Section>
      )}
    </DetailPageLayout>
  )
}
