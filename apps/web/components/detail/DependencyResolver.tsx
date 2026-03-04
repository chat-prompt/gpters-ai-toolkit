/**
 * Dependency resolver component with tree visualization
 *
 * Displays and analyzes dependencies for catalog items,
 * including transitive dependencies, circular detection,
 * and recommended installation order.
 */
'use client'

import { useState, useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import { parseDependency, MCP_SERVERS } from '@/lib/core/types'

/**
 * Resolved dependency with metadata
 */
interface ResolvedDependency {
  /** Dependency type */
  type: 'mcp' | 'skill' | 'agent' | 'other'
  /** Dependency identifier */
  id: string
  /** Display label */
  label: string
  /** Whether this is a direct dependency */
  direct: boolean
  /** Depth in dependency tree */
  depth: number
  /** Whether dependency is available */
  available: boolean
  /** List of items that require this dependency */
  requiredBy: string[]
  /** Configuration URL for MCP servers */
  configUrl?: string
  /** Linked catalog item info */
  catalogItem?: {
    id: string
    name: string
    type: string
  }
}

/**
 * API response structure for dependency resolution
 */
interface DependencyResolutionData {
  /** Whether resolution succeeded */
  success: boolean
  /** Resolution data when successful */
  data?: {
    rootId: string
    totalCount: number
    maxDepth: number
    hasCircularDependencies: boolean
    summary: {
      mcp: number
      skills: number
      agents: number
      unresolved: number
    }
    dependencies: ResolvedDependency[]
    circularPaths: string[][]
    installOrder: string[]
  }
  /** Error message when failed */
  error?: string
}

/**
 * Props for the DependencyResolver component
 */
interface DependencyResolverProps {
  /** Item being analyzed */
  itemId: string
  /** List of dependency strings */
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
 * Interactive dependency analyzer with tree visualization
 *
 * @example
 * ```tsx
 * <DependencyResolver
 *   itemId="advanced-skill"
 *   dependencies={['mcp:github', 'skill:base-helper']}
 * />
 * ```
 */
export function DependencyResolver({ itemId, dependencies }: DependencyResolverProps) {
  const [resolved, setResolved] = useState<DependencyResolutionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showTree, setShowTree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only show basic deps if there are direct dependencies
  if (!dependencies || dependencies.length === 0) {
    return null
  }

  const parsedDeps = dependencies.map(parseDependency)

  const fetchResolution = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/catalog/${itemId}/dependencies`)
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to resolve dependencies')
      }
      setResolved(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dependencies')
    } finally {
      setLoading(false)
    }
  }

  const renderDependencyItem = (dep: ResolvedDependency, index: number) => {
    const icon = TYPE_ICONS[dep.type] || TYPE_ICONS.other
    const colorClass = TYPE_COLORS[dep.type] || TYPE_COLORS.other
    const mcpInfo = dep.type === 'mcp' ? MCP_SERVERS[dep.id] : null

    const isInternalLink = dep.type === 'skill' || dep.type === 'agent'
    const href = isInternalLink ? `/${dep.type}/${dep.catalogItem?.id || dep.id}` : undefined

    const content = (
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${colorClass} ${
          !dep.direct ? 'opacity-70' : ''
        }`}
      >
        <span className="text-lg">{icon}</span>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {dep.catalogItem?.name || dep.label}
            </span>
            {!dep.direct && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                transitive
              </span>
            )}
            {!dep.available && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                missing
              </span>
            )}
          </div>
          {mcpInfo && (
            <span className="text-xs text-[var(--text-muted)]">
              {mcpInfo.description}
            </span>
          )}
          {dep.depth > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              Required by: {dep.requiredBy.slice(0, 2).join(', ')}
              {dep.requiredBy.length > 2 && ` +${dep.requiredBy.length - 2} more`}
            </span>
          )}
        </div>
      </div>
    )

    if (isInternalLink && href) {
      return (
        <Link key={`${dep.type}:${dep.id}-${index}`} href={href}>
          {content}
        </Link>
      )
    }

    if (dep.type === 'mcp' && dep.configUrl) {
      return (
        <a
          key={`${dep.type}:${dep.id}-${index}`}
          href={dep.configUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {content}
        </a>
      )
    }

    return <div key={`${dep.type}:${dep.id}-${index}`}>{content}</div>
  }

  return (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔗</span>
          <h2 className="text-lg font-medium text-[var(--text-primary)]">필요한 의존성</h2>
          {resolved?.data && (
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              {resolved.data.totalCount}개 발견
            </span>
          )}
        </div>
        <button
          onClick={fetchResolution}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors disabled:opacity-50"
        >
          {loading ? '분석 중...' : resolved ? '다시 분석' : '전체 의존성 분석'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Basic dependencies (always shown) */}
      {!resolved && (
        <>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            이 리소스를 사용하려면 다음 의존성이 필요합니다.
          </p>
          <div className="flex flex-wrap gap-3">
            {parsedDeps.map((dep, index) => {
              const icon = TYPE_ICONS[dep.type] || TYPE_ICONS.other
              const colorClass = TYPE_COLORS[dep.type] || TYPE_COLORS.other
              const mcpInfo = dep.type === 'mcp' ? MCP_SERVERS[dep.id] : null
              const isInternalLink = dep.type === 'skill' || dep.type === 'agent'
              const href = isInternalLink ? `/${dep.type}/${dep.id}` : undefined

              const content = (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${colorClass}`}>
                  <span className="text-lg">{icon}</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{dep.label}</span>
                    {mcpInfo && <span className="text-xs text-[var(--text-muted)]">{mcpInfo.description}</span>}
                  </div>
                </div>
              )

              if (isInternalLink && href) {
                return <Link key={index} href={href}>{content}</Link>
              }
              if (dep.type === 'mcp') {
                return (
                  <a key={index} href={`https://github.com/modelcontextprotocol/servers/tree/main/src/${dep.id}`} target="_blank" rel="noopener noreferrer">
                    {content}
                  </a>
                )
              }
              return <div key={index}>{content}</div>
            })}
          </div>
        </>
      )}

      {/* Resolved dependencies */}
      {resolved?.data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <div className="text-xl font-bold text-blue-400">{resolved.data.summary.mcp}</div>
              <div className="text-xs text-[var(--text-muted)]">MCP 서버</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <div className="text-xl font-bold text-[var(--accent-cyan)]">{resolved.data.summary.skills}</div>
              <div className="text-xs text-[var(--text-muted)]">스킬</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <div className="text-xl font-bold text-[var(--accent-purple)]">{resolved.data.summary.agents}</div>
              <div className="text-xs text-[var(--text-muted)]">에이전트</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-center">
              <div className={`text-xl font-bold ${resolved.data.summary.unresolved > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {resolved.data.summary.unresolved}
              </div>
              <div className="text-xs text-[var(--text-muted)]">미해결</div>
            </div>
          </div>

          {/* Circular dependency warning */}
          {resolved.data.hasCircularDependencies && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium mb-1">
                <span>⚠️</span>
                <span>순환 의존성 감지됨</span>
              </div>
              <p className="text-xs text-yellow-400/80">
                {resolved.data.circularPaths.map((path) => path.join(' → ')).join('; ')}
              </p>
            </div>
          )}

          {/* Toggle tree view */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setShowTree(!showTree)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {showTree ? '▼ 직접 의존성만 보기' : '▶ 전체 의존성 트리 보기'}
            </button>
          </div>

          {/* Dependency list */}
          <div className="flex flex-wrap gap-3">
            {(showTree
              ? resolved.data.dependencies
              : resolved.data.dependencies.filter((d) => d.direct)
            ).map(renderDependencyItem)}
          </div>

          {/* Installation order hint */}
          {showTree && resolved.data.installOrder.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-muted)] mb-2">
                💡 <strong>권장 설치 순서</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {resolved.data.installOrder.map((id, i) => (
                  <span key={id} className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    {i + 1}. {id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* MCP server hint */}
      {parsedDeps.some((d) => d.type === 'mcp') && (
        <div className="mt-4 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">
            💡 <strong>MCP 서버</strong>는 Claude Code 설정에서 활성화해야 합니다.{' '}
            <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">claude mcp</code> 명령어로 설정할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}
