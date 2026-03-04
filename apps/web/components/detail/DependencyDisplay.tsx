/**
 * Simple dependency display component
 *
 * Shows a list of required dependencies with type icons,
 * links to internal items, and MCP server hints.
 */
import { Link } from '@/i18n/navigation'
import { parseDependency, MCP_SERVERS } from '@/lib/core/types'

/**
 * Props for the DependencyDisplay component
 */
interface DependencyDisplayProps {
  /** List of dependency strings in format "type:id" */
  dependencies: string[]
}

/** Icon mapping for dependency types */
const TYPE_ICONS: Record<string, string> = {
  mcp: '🔌',
  skill: '⚡',
  agent: '◈',
  other: '📦',
}

const TYPE_COLORS: Record<string, string> = {
  mcp: 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10',
  skill: 'border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 hover:bg-[var(--accent-cyan)]/10',
  agent: 'border-[var(--accent-purple)]/30 bg-[var(--accent-purple)]/5 hover:bg-[var(--accent-purple)]/10',
  other: 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]',
}

/**
 * Displays required dependencies with links and type indicators
 *
 * @example
 * ```tsx
 * <DependencyDisplay dependencies={['mcp:github', 'skill:helper']} />
 * ```
 */
export function DependencyDisplay({ dependencies }: DependencyDisplayProps) {
  if (!dependencies || dependencies.length === 0) {
    return null
  }

  const parsedDeps = dependencies.map(parseDependency)

  return (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">🔗</span>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">필요한 의존성</h2>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-4">
        이 리소스를 사용하려면 다음 의존성이 필요합니다.
      </p>

      <div className="flex flex-wrap gap-3">
        {parsedDeps.map((dep, index) => {
          const icon = TYPE_ICONS[dep.type] || TYPE_ICONS.other
          const colorClass = TYPE_COLORS[dep.type] || TYPE_COLORS.other
          const mcpInfo = dep.type === 'mcp' ? MCP_SERVERS[dep.id] : null

          // Link to internal items if they're skills or agents
          const isInternalLink = dep.type === 'skill' || dep.type === 'agent'
          const href = isInternalLink ? `/${dep.type}/${dep.id}` : undefined

          const content = (
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${colorClass}`}
            >
              <span className="text-lg">{icon}</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {dep.label}
                </span>
                {mcpInfo && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {mcpInfo.description}
                  </span>
                )}
                {isInternalLink && (
                  <span className="text-xs text-[var(--text-muted)]">
                    클릭하여 상세 보기 →
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
        <div className="mt-4 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">
            💡 <strong>MCP 서버</strong>는 Claude Code 설정에서 활성화해야 합니다.{' '}
            <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">
              claude mcp
            </code>{' '}
            명령어로 설정할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}
