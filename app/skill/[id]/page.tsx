import { getItemById, getCatalog } from '@/lib/catalog'
import { DetailPageLayout } from '@/components/DetailPageLayout'
import { ItemHero } from '@/components/ItemHero'
import { ContentSection } from '@/components/ContentSection'
import { InstallGuide } from '@/components/InstallGuide'
import { DependencyDisplay } from '@/components/DependencyDisplay'
import { ChangelogDisplay } from '@/components/ChangelogDisplay'
import { TableOfContents, Section, type TocItem } from '@/components/TableOfContents'
import { DraftBanner } from '@/components/DraftBanner'
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

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요', icon: '📋' },
  ]

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
        />
      </Section>

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
    </DetailPageLayout>
  )
}
