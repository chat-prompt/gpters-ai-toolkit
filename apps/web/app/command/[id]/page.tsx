/**
 * Command detail page
 *
 * Displays detailed information about a specific slash command including
 * content, installation guide, usage examples, and related items.
 */
import { getItemById, getRelatedItems } from '@/lib/core/catalog'
import { parseExamplesFromContent } from '@/lib/search/parse-examples'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ContentSection } from '@/components/detail/ContentSection'
import { InstallGuide } from '@/components/detail/InstallGuide'
import { QuickActionGenerator } from '@/components/actions/QuickActionGenerator'
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

export default async function CommandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getItemById(id)

  if (!item || item.type !== 'command') {
    notFound()
  }

  const session = await auth()
  const currentOrgId = session?.user?.currentOrgId

  // Fetch related items
  const relatedItems = await getRelatedItems(item.id, item.tags, item.authorId ?? null, 6)

  // Check for examples in content
  const hasExamples = parseExamplesFromContent(item.content).length > 0

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요', icon: '⌘' },
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

  tocItems.push({ id: 'quick-actions', label: '퀵 액션', icon: '🚀' })
  tocItems.push({ id: 'install', label: '설치 방법', icon: '📦' })
  tocItems.push({ id: 'content', label: 'command.md', icon: '📄' })

  if (item.readme) {
    tocItems.push({ id: 'readme', label: 'README', icon: '📖' })
  }

  if (relatedItems.length > 0) {
    tocItems.push({ id: 'related', label: '관련 아이템', icon: '🔗' })
  }

  return (
    <DetailPageLayout accentColor="rose">
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
          orgName={item.orgName}
          orgId={item.orgId}
          visibility={item.visibility}
          currentOrgId={currentOrgId}
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

      {/* Quick Actions */}
      <Section id="quick-actions" className="mb-8">
        <QuickActionGenerator
          itemId={item.id}
          allowedTools={item.allowedTools}
          mcpEnabled={item.mcpEnabled}
        />
      </Section>

      {/* Installation Guide */}
      <Section id="install" className="mb-8">
        <InstallGuide
          itemId={item.id}
          itemType="command"
          content={item.content}
        />
      </Section>

      {/* Command Content */}
      <Section id="content">
        <ContentSection title="command.md" content={item.content} />
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
            currentItemAuthorId={item.authorId}
          />
        </Section>
      )}

      {/* Admin Edit Button */}
      <AdminEditButton itemId={item.id} returnUrl={`/command/${item.id}`} />
    </DetailPageLayout>
  )
}
