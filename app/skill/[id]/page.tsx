import { getItemById, getCatalog } from '@/lib/catalog'
import { DetailPageLayout } from '@/components/DetailPageLayout'
import { ItemHero } from '@/components/ItemHero'
import { ContentSection } from '@/components/ContentSection'
import { InstallGuide } from '@/components/InstallGuide'
import { DependencyDisplay } from '@/components/DependencyDisplay'
import { ChangelogDisplay } from '@/components/ChangelogDisplay'
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

  return (
    <DetailPageLayout accentColor="cyan">
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

      {/* Dependencies */}
      {item.dependencies && item.dependencies.length > 0 && (
        <DependencyDisplay dependencies={item.dependencies} />
      )}

      {/* Changelog */}
      {item.changelog && (
        <ChangelogDisplay
          version={item.marketplaceVersion}
          changelog={item.changelog}
          updatedAt={item.updatedAt}
        />
      )}

      {/* Installation Guide */}
      <div className="mb-8">
        <InstallGuide
          itemId={item.id}
          itemType="skill"
          pluginId={item.pluginId}
          content={item.content}
          marketplaceEnabled={item.marketplaceEnabled}
        />
      </div>

      {/* Skill Content */}
      <ContentSection title="skill.md" content={item.content} />

      {/* README */}
      {item.readme && (
        <ContentSection title="README.md" icon="📖" content={item.readme} />
      )}
    </DetailPageLayout>
  )
}
