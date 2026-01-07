/**
 * Guide detail page
 *
 * Displays detailed content for a specific guide or tutorial
 * with markdown rendering and changelog display.
 */
import { getGuideById, getGuides } from '@/lib/core/catalog'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ChangelogDisplay } from '@/components/detail/ChangelogDisplay'
import { ContentSection } from '@/components/detail/ContentSection'
import { AdminEditButton } from '@/components/admin/AdminEditButton'
import { notFound } from 'next/navigation'
import Link from 'next/link'

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
    <DetailPageLayout accentColor="emerald">
      {/* Back Navigation */}
      <nav className="mb-6">
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-emerald)] transition-colors"
        >
          <span>←</span>
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
        likes={guide.likes}
        difficulty={guide.difficulty}
        estimatedTime={guide.estimatedTime}
        updatedAt={guide.updatedAt}
        status={guide.status}
        version={guide.version}
        showLikes={true}
      />

      {/* Changelog */}
      {guide.changelog && (
        <ChangelogDisplay
          version={guide.version}
          changelog={guide.changelog}
          updatedAt={guide.updatedAt}
        />
      )}

      {/* Guide Content */}
      <ContentSection title="guide.md" icon="📚" content={guide.content} />

      {/* README */}
      {guide.readme && (
        <ContentSection title="README.md" icon="📖" content={guide.readme} />
      )}

      {/* Admin Edit Button */}
      <AdminEditButton itemId={guide.id} returnUrl={`/guides/${guide.id}`} />
    </DetailPageLayout>
  )
}
