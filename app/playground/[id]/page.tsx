/**
 * Playground page
 *
 * Interactive sandbox for testing and previewing catalog items
 * with mock conversation simulation and content editing.
 */
import { getItemById, getCatalog } from '@/lib/core/catalog'
import { SkillPlayground } from '@/components/features/skill/SkillPlayground'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const revalidate = 60
export const dynamicParams = true

// Generate metadata for the page
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const item = await getItemById(id)

  if (!item) {
    return {
      title: 'Not Found',
    }
  }

  return {
    title: `Playground: ${item.name}`,
    description: `${item.name} 플레이그라운드에서 스킬을 미리 확인하고 테스트해보세요. ${item.description}`,
    openGraph: {
      title: `Playground: ${item.name}`,
      description: item.description,
    },
  }
}

// Generate static params for all items
export async function generateStaticParams() {
  const catalog = await getCatalog()
  return catalog.map((item) => ({ id: item.id }))
}

// Get type-specific route
function getTypeRoute(type: string): string {
  switch (type) {
    case 'skill':
      return '/skill'
    case 'agent':
      return '/agent'
    case 'command':
      return '/command'
    case 'hook':
      return '/hook'
    case 'guide':
      return '/guides'
    default:
      return '/'
  }
}

// Get type label in Korean
function getTypeLabel(type: string): string {
  switch (type) {
    case 'skill':
      return 'Skill'
    case 'agent':
      return 'Agent'
    case 'command':
      return 'Command'
    case 'hook':
      return 'Hook'
    case 'guide':
      return 'Guide'
    default:
      return 'Item'
  }
}

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = await getItemById(id)

  if (!item) {
    notFound()
  }

  const typeRoute = getTypeRoute(item.type)
  const typeLabel = getTypeLabel(item.type)

  // Get base URL for sharing
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-toolkit.gpters.org'

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href={`${typeRoute}/${id}`}
              className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
            >
              <span>←</span>
              <span>Back to {typeLabel}</span>
            </Link>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-sm text-[var(--text-primary)] font-medium">
              Playground
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Catalog
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0">
        <SkillPlayground item={item} baseUrl={baseUrl} />
      </main>
    </div>
  )
}
