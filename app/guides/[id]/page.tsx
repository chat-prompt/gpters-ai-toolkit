import { getGuideById, getGuides } from '@/lib/core/catalog'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ChangelogDisplay } from '@/components/detail/ChangelogDisplay'
import { MarkdownContent } from '@/components/ui/MarkdownContent'
import { AdminEditButton } from '@/components/admin/AdminEditButton'
import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export async function generateStaticParams() {
  const guides = await getGuides()
  return guides.map(guide => ({ id: guide.id }))
}

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guide = await getGuideById(id)

  if (!guide) {
    notFound()
  }

  return (
    <DetailPageLayout accentColor="emerald" backHref="/guides" backLabel="Back to Guides">
      <ItemHero
        type="guide"
        itemId={guide.id}
        name={guide.name}
        description={guide.description}
        authorName={guide.authorName}
        tags={guide.tags}
        likes={guide.likes}
        difficulty={guide.difficulty}
        estimatedTime={guide.estimatedTime}
        updatedAt={guide.updatedAt}
        status={guide.status}
        marketplaceVersion={guide.marketplaceVersion}
        showLikes={false}
      />

      {/* Changelog */}
      {guide.changelog && (
        <ChangelogDisplay
          version={guide.marketplaceVersion}
          changelog={guide.changelog}
          updatedAt={guide.updatedAt}
        />
      )}

      {/* Guide Content */}
      <div className="glass rounded-2xl p-8 mb-8" style={{ boxShadow: '0 0 30px rgba(16,185,129,0.1)' }}>
        <article className="prose prose-invert prose-emerald max-w-none">
          <MarkdownContent content={guide.content} />
        </article>
      </div>

      {/* README */}
      {guide.readme && (
        <div className="glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xl">📖</span>
            <h2 className="text-lg font-medium text-[var(--text-primary)]">추가 정보</h2>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
            <MarkdownContent content={guide.readme} />
          </div>
        </div>
      )}

      {/* Admin Edit Button */}
      <AdminEditButton itemId={guide.id} returnUrl={`/guides/${guide.id}`} />
    </DetailPageLayout>
  )
}
