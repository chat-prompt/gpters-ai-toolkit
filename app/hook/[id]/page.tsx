import { getItemById, getCatalog } from '@/lib/catalog'
import { HOOK_EVENTS } from '@/lib/types'
import type { HookEvent } from '@/lib/types'
import { DetailPageLayout } from '@/components/DetailPageLayout'
import { ItemHero } from '@/components/ItemHero'
import { ContentSection } from '@/components/ContentSection'
import { CopyButton } from '@/components/CopyButton'
import { TableOfContents, Section, type TocItem } from '@/components/TableOfContents'
import { DraftBanner } from '@/components/DraftBanner'
import { TryItButton } from '@/components/TryItButton'
import { DownloadButton } from '@/components/DownloadButton'
import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export async function generateStaticParams() {
  const catalog = await getCatalog()
  return catalog
    .filter(item => item.type === 'hook')
    .map(item => ({ id: item.id }))
}

function generateHookSettingsSnippet(item: {
  hookEvent: HookEvent
  hookMatcher?: string | null
  hookCommand: string
  hookTimeout?: number | null
  hookBlocking?: boolean | null
}): string {
  const hookConfig: Record<string, unknown> = {
    type: 'command',
    command: item.hookCommand,
  }

  if (item.hookTimeout) {
    hookConfig.timeout = item.hookTimeout
  }

  if (item.hookBlocking === false) {
    hookConfig.blocking = false
  }

  const matcherConfig: Record<string, unknown> = {
    hooks: [hookConfig],
  }

  if (item.hookMatcher) {
    matcherConfig.matcher = item.hookMatcher
  }

  const settingsSnippet = {
    hooks: {
      [item.hookEvent]: [matcherConfig],
    },
  }

  return JSON.stringify(settingsSnippet, null, 2)
}

export default async function HookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getItemById(id)

  if (!item || item.type !== 'hook') {
    notFound()
  }

  const hookEvent = item.hookEvent as HookEvent | undefined
  const eventInfo = hookEvent ? HOOK_EVENTS[hookEvent] : null

  const settingsSnippet = hookEvent && item.hookCommand
    ? generateHookSettingsSnippet({
        hookEvent,
        hookMatcher: item.hookMatcher,
        hookCommand: item.hookCommand,
        hookTimeout: item.hookTimeout,
        hookBlocking: item.hookBlocking,
      })
    : null

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요', icon: '🪝' },
  ]

  if (hookEvent) {
    tocItems.push({ id: 'settings', label: 'Hook 설정', icon: '⚙️' })
  }

  if (settingsSnippet) {
    tocItems.push({ id: 'install', label: '설치 방법', icon: '📋' })
  }

  tocItems.push({ id: 'content', label: '설명', icon: '📄' })

  if (item.readme) {
    tocItems.push({ id: 'readme', label: 'README', icon: '📖' })
  }

  // Extra badges: hook event + try it button + download
  const extraBadges = (
    <>
      {eventInfo && (
        <span className="text-[10px] px-2 py-1 rounded-full bg-orange-500/10 text-orange-400">
          {eventInfo.label}
        </span>
      )}
      <TryItButton itemId={item.id} />
      <DownloadButton itemId={item.id} itemName={item.name} size="sm" />
    </>
  )

  return (
    <DetailPageLayout accentColor="orange">
      <TableOfContents items={tocItems} />

      {item.status === 'draft' && <DraftBanner />}

      <Section id="overview">
        <ItemHero
          type="hook"
          itemId={item.id}
          name={item.name}
          description={item.description}
          author={item.author}
          tags={item.tags}
          likes={item.likes}
          updatedAt={item.updatedAt}
          status={item.status}
          marketplaceVersion={item.marketplaceVersion}
          extraBadges={extraBadges}
        />
      </Section>

      {/* Hook Details */}
      {hookEvent && (
        <Section id="settings">
          <div className="glass rounded-2xl p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-xl">⚙️</span>
              <h2 className="text-lg font-medium text-[var(--text-primary)]">Hook 설정</h2>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Event</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-orange-400">{hookEvent}</span>
                </div>
                {eventInfo && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">{eventInfo.description}</p>
                )}
              </div>

              {item.hookMatcher && (
                <div>
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Matcher</div>
                  <span className="text-sm font-mono text-[var(--accent-cyan)]">{item.hookMatcher}</span>
                </div>
              )}

              <div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Command</div>
                <code className="text-sm font-mono text-[var(--text-primary)] bg-[var(--bg-tertiary)] px-2 py-1 rounded">
                  {item.hookCommand}
                </code>
              </div>

              <div className="flex gap-6">
                {item.hookTimeout && (
                  <div>
                    <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Timeout</div>
                    <span className="text-sm font-mono text-[var(--text-primary)]">{item.hookTimeout}ms</span>
                  </div>
                )}

                <div>
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Blocking</div>
                  <span className={`text-sm font-mono ${item.hookBlocking !== false ? 'text-green-400' : 'text-yellow-400'}`}>
                    {item.hookBlocking !== false ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Installation Guide */}
      {settingsSnippet && (
        <Section id="install">
          <div className="glass rounded-2xl p-8 mb-8 border border-orange-500/20">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">📋</span>
              <h2 className="text-lg font-medium text-[var(--text-primary)]">설치 방법</h2>
            </div>

            <div className="mb-4">
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                아래 설정을 <code className="text-orange-400">~/.claude/settings.json</code> 또는
                <code className="text-orange-400 ml-1">프로젝트/.claude/settings.local.json</code>에 추가하세요.
              </p>

              <div className="bg-[var(--bg-primary)] rounded-xl p-4 relative">
                <div className="absolute top-3 right-3">
                  <CopyButton text={settingsSnippet} />
                </div>
                <pre className="text-sm font-mono text-[var(--accent-cyan)] overflow-x-auto">
                  {settingsSnippet}
                </pre>
              </div>
            </div>

            <div className="text-xs text-[var(--text-muted)] space-y-1">
              <p>💡 <strong>팁:</strong> 이미 hooks 섹션이 있다면 해당 이벤트 배열에 설정을 추가하세요.</p>
              <p>📖 <a href="https://docs.anthropic.com/en/docs/claude-code/hooks" className="text-orange-400 hover:underline" target="_blank" rel="noopener noreferrer">Hook 문서 보기 →</a></p>
            </div>
          </div>
        </Section>
      )}

      {/* Hook Content */}
      <Section id="content">
        <ContentSection title="설명" content={item.content} />
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
