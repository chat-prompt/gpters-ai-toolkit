import { getItemById, getCatalog } from '@/lib/catalog'
import { TAGS, HOOK_EVENTS } from '@/lib/types'
import type { HookEvent } from '@/lib/types'
import { CopyButton } from '@/components/CopyButton'
import { MarkdownContent } from '@/components/MarkdownContent'
import { LikeButton } from '@/components/LikeButton'
import Link from 'next/link'
import { notFound } from 'next/navigation'

// Revalidate every 60 seconds
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

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-orange-500 opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-8 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
          >
            <span>←</span>
            <span>Back to Catalog</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🪝</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-orange-400 uppercase">
              Hook
            </span>
            {eventInfo && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-orange-500/10 text-orange-400">
                {eventInfo.label}
              </span>
            )}
          </div>

          <h1 className="text-4xl font-light text-[var(--text-primary)] tracking-tight mb-4" style={{ fontFamily: 'var(--font-newsreader)' }}>
            {item.name}
          </h1>

          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mb-8">
            {item.description}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {item.tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                {TAGS[tag]?.label || tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
            <span>@{item.author}</span>
            {item.updatedAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                <span>Updated {item.updatedAt}</span>
              </>
            )}
            <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
            <LikeButton itemId={item.id} initialLikes={item.likes} />
          </div>
        </div>

        {/* Hook Details */}
        {hookEvent && (
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
        )}

        {/* Installation Guide */}
        {settingsSnippet && (
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
        )}

        {/* Hook Content (Description/Guide) */}
        <div className="glass rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-xl">📄</span>
              <h2 className="text-lg font-medium text-[var(--text-primary)]">설명</h2>
            </div>
            <CopyButton text={item.content} />
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
            <MarkdownContent content={item.content} />
          </div>
        </div>

        {/* README */}
        {item.readme && (
          <div className="glass rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="text-xl">📖</span>
                <h2 className="text-lg font-medium text-[var(--text-primary)]">README.md</h2>
              </div>
              <CopyButton text={item.readme} />
            </div>

            <div className="bg-[var(--bg-primary)] rounded-xl p-6 overflow-x-auto">
              <MarkdownContent content={item.readme} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
