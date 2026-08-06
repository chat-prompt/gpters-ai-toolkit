/**
 * 의존성 목록 카드
 *
 * 이 항목을 쓰려면 무엇이 먼저 있어야 하는지 보여준다. 종류마다 색을 달리
 * 칠하던 방식은 걷어내고, 고정폭 라벨 하나로만 구분한다.
 */
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { parseDependency, MCP_SERVERS } from '@/lib/core/types'

/**
 * Props for the DependencyDisplay component
 */
interface DependencyDisplayProps {
  /** "type:id" 형식의 의존성 문자열 목록 */
  dependencies: string[]
}

/** 의존성 종류별 표시 라벨 */
const TYPE_LABELS: Record<string, string> = {
  mcp: 'MCP',
  skill: 'SKILL',
  agent: 'AGENT',
  other: 'DEP',
}

/** 의존성 한 칸의 공통 모양 — 링크로 감싸든 아니든 같은 모양을 쓴다 */
const ITEM_CLASS =
  'flex h-full items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-4 py-3 transition-colors hover:border-[var(--border-hover)]'

/**
 * 의존성 목록
 *
 * @param dependencies - "type:id" 형식의 의존성 문자열 목록
 *
 * @example
 * ```tsx
 * <DependencyDisplay dependencies={['mcp:github', 'skill:helper']} />
 * ```
 */
export async function DependencyDisplay({ dependencies }: DependencyDisplayProps) {
  if (!dependencies || dependencies.length === 0) {
    return null
  }

  const t = await getTranslations('detail')
  const parsedDeps = dependencies.map(parseDependency)

  return (
    <div className="surface-card mb-8">
      <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
        {t('dependencies.title')}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {t('dependencies.description')}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {parsedDeps.map((dep, index) => {
          const mcpInfo = dep.type === 'mcp' ? MCP_SERVERS[dep.id] : null

          // 내부 카탈로그에 있는 종류만 상세 페이지로 이어 준다
          const isInternalLink = dep.type === 'skill' || dep.type === 'agent'
          const href = isInternalLink ? `/${dep.type}/${dep.id}` : undefined

          const content = (
            <div className={ITEM_CLASS}>
              <span className="eyebrow shrink-0 pt-0.5">
                {TYPE_LABELS[dep.type] || TYPE_LABELS.other}
              </span>
              <div className="min-w-0">
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  {dep.label}
                </span>
                {mcpInfo && (
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    {mcpInfo.description}
                  </span>
                )}
                {isInternalLink && (
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    {t('dependencies.clickToView')}
                  </span>
                )}
              </div>
            </div>
          )

          if (isInternalLink && href) {
            return (
              <Link key={index} href={href}>
                {content}
              </Link>
            )
          }

          if (dep.type === 'mcp') {
            return (
              <a
                key={index}
                href={`https://github.com/modelcontextprotocol/servers/tree/main/src/${dep.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content}
              </a>
            )
          }

          return <div key={index}>{content}</div>
        })}
      </div>

      {parsedDeps.some((d) => d.type === 'mcp') && (
        <p className="mt-4 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
          <strong className="font-medium text-[var(--text-secondary)]">
            {t('dependencies.mcpServers')}
          </strong>
          {t('dependencies.mcpHintBefore')}{' '}
          <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">claude mcp</code>{' '}
          {t('dependencies.mcpHintAfter')}
        </p>
      )}
    </div>
  )
}
