/**
 * Hook detail page
 *
 * Displays detailed information about a specific Claude Code hook
 * including event configuration, security analysis, and settings snippets.
 */
import { setRequestLocale } from 'next-intl/server'
import { getItemById } from '@/lib/core/catalog'
import { HOOK_EVENTS } from '@/lib/core/types'
import type { HookEvent } from '@/lib/core/types'
import { validateHookSecurity } from '@/lib/plugin/hook-security'
import { DetailPageLayout } from '@/components/detail/DetailPageLayout'
import { ItemHero } from '@/components/detail/ItemHero'
import { ContentSection } from '@/components/detail/ContentSection'
import { CopyButton } from '@/components/ui/CopyButton'
import { TableOfContents, Section, type TocItem } from '@/components/detail/TableOfContents'
import { DraftBanner } from '@/components/detail/DraftBanner'
import { AdminEditButton } from '@/components/admin/AdminEditButton'
import { auth } from '@/lib/core/auth'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

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

/**
 * Hook 상세 페이지
 *
 * @param params - locale 과 항목 id 를 담은 라우트 파라미터
 */
export default async function HookPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [item, session] = await Promise.all([getItemById(id), auth()])

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

  // Security validation
  const securityResult = item.hookCommand
    ? validateHookSecurity(item.hookCommand)
    : null

  // Build TOC items based on available content
  const tocItems: TocItem[] = [
    { id: 'overview', label: '개요' },
  ]

  if (hookEvent) {
    tocItems.push({ id: 'settings', label: 'Hook 설정' })
  }

  if (settingsSnippet) {
    tocItems.push({ id: 'install', label: '설치 방법' })
  }

  tocItems.push({ id: 'content', label: '설명' })

  if (item.readme) {
    tocItems.push({ id: 'readme', label: 'README' })
  }

  // 머리글에 덧붙이는 배지 — 이 Hook이 걸리는 이벤트
  const extraBadges = eventInfo ? (
    <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
      {eventInfo.label}
    </span>
  ) : null

  return (
    <DetailPageLayout>
      <TableOfContents items={tocItems} />

      {item.status === 'draft' && <DraftBanner />}

      <Section id="overview">
        <ItemHero
          type="hook"
          itemId={item.id}
          name={item.name}
          description={item.description}
          authorName={item.authorName}
          tags={item.tags}
          updatedAt={item.updatedAt}
          status={item.status}
          version={item.version}
          extraBadges={extraBadges}
        />
      </Section>

      {/* Hook 설정 */}
      {hookEvent && (
        <Section id="settings">
          <div className="surface-card mb-8">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
              Hook 설정
            </h2>

            {/* 보안 경고 — 위험도는 색이 아니라 라벨로 알린다 */}
            {securityResult && !securityResult.safe && (
              <div className="mt-5 border-l-2 border-[var(--brand-primary)] pl-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  보안 검사 결과: <span className="font-mono tabular-nums">{securityResult.risks.length}</span>개 위험 감지
                  <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {securityResult.riskLevel}
                  </span>
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                  {securityResult.risks.slice(0, 3).map((risk, i) => (
                    <li key={i}>{risk.message}</li>
                  ))}
                  {securityResult.risks.length > 3 && (
                    <li className="text-[var(--text-muted)]">
                      외 {securityResult.risks.length - 3}개
                    </li>
                  )}
                </ul>
              </div>
            )}

            <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="eyebrow">Event</dt>
                <dd className="mt-1.5 font-mono text-sm break-all text-[var(--text-primary)]">
                  {hookEvent}
                </dd>
                {eventInfo && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{eventInfo.description}</p>
                )}
              </div>

              {item.hookMatcher && (
                <div className="min-w-0">
                  <dt className="eyebrow">Matcher</dt>
                  <dd className="mt-1.5 font-mono text-sm break-all text-[var(--text-primary)]">
                    {item.hookMatcher}
                  </dd>
                </div>
              )}

              <div className="min-w-0 sm:col-span-2">
                <dt className="eyebrow">Command</dt>
                <dd className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-1 font-mono text-sm break-all text-[var(--text-primary)]">
                    {item.hookCommand}
                  </code>
                  {securityResult && (
                    <span
                      className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]"
                      title={
                        securityResult.safe
                          ? 'No security risks detected'
                          : `${securityResult.risks.length} risk(s) detected`
                      }
                    >
                      {securityResult.safe
                        ? 'Safe'
                        : `${securityResult.risks.length} risk${securityResult.risks.length > 1 ? 's' : ''}`}
                    </span>
                  )}
                </dd>
              </div>

              {item.hookTimeout && (
                <div className="min-w-0">
                  <dt className="eyebrow">Timeout</dt>
                  <dd className="mt-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)]">
                    {item.hookTimeout}ms
                  </dd>
                </div>
              )}

              <div className="min-w-0">
                <dt className="eyebrow">Blocking</dt>
                <dd className="mt-1.5 font-mono text-sm text-[var(--text-primary)]">
                  {item.hookBlocking !== false ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </div>
        </Section>
      )}

      {/* 설치 방법 */}
      {settingsSnippet && (
        <Section id="install">
          <div className="surface-card mb-8">
            <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
              설치 방법
            </h2>

            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              아래 설정을{' '}
              <code className="font-mono text-[var(--text-primary)]">~/.claude/settings.json</code>{' '}
              또는{' '}
              <code className="font-mono text-[var(--text-primary)]">
                프로젝트/.claude/settings.local.json
              </code>
              에 추가하세요.
            </p>

            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2">
                <span className="eyebrow">settings.json</span>
                <CopyButton text={settingsSnippet} />
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
                {settingsSnippet}
              </pre>
            </div>

            <div className="mt-4 space-y-1 text-xs text-[var(--text-muted)]">
              <p>
                <strong className="font-medium text-[var(--text-secondary)]">팁:</strong> 이미 hooks
                섹션이 있다면 해당 이벤트 배열에 설정을 추가하세요.
              </p>
              <p>
                <a
                  href="https://docs.anthropic.com/en/docs/claude-code/hooks"
                  className="text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Hook 문서 보기 &rarr;
                </a>
              </p>
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
          <ContentSection title="README.md" content={item.readme} />
        </Section>
      )}

      {/* Admin Edit Button */}
      <AdminEditButton itemId={item.id} returnUrl={`/hook/${item.id}`} />
    </DetailPageLayout>
  )
}
