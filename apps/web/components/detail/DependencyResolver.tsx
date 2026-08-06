'use client'

/**
 * 의존성 분석 카드
 *
 * 직접 의존성만 먼저 보여주고, 요청이 있을 때만 전이 의존성까지 서버에서
 * 풀어 온다 — 대부분의 방문은 목록만 보고 끝나기 때문이다.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { parseDependency, MCP_SERVERS } from '@/lib/core/types'

/**
 * 풀어낸 의존성 하나
 */
interface ResolvedDependency {
  /** 의존성 종류 */
  type: 'mcp' | 'skill' | 'agent' | 'other'
  /** 의존성 식별자 */
  id: string
  /** 표시 이름 */
  label: string
  /** 직접 의존성 여부 */
  direct: boolean
  /** 의존성 트리에서의 깊이 */
  depth: number
  /** 사용 가능 여부 */
  available: boolean
  /** 이 의존성을 요구하는 항목들 */
  requiredBy: string[]
  /** MCP 서버 설정 문서 주소 */
  configUrl?: string
  /** 카탈로그에 있는 항목 정보 */
  catalogItem?: {
    id: string
    name: string
    type: string
  }
}

/**
 * 의존성 분석 API 응답
 */
interface DependencyResolutionData {
  /** 분석 성공 여부 */
  success: boolean
  /** 성공 시 분석 결과 */
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
  /** 실패 시 오류 메시지 */
  error?: string
}

/**
 * Props for the DependencyResolver component
 */
interface DependencyResolverProps {
  /** 분석 대상 항목 */
  itemId: string
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

/** 의존성 한 칸의 공통 모양 */
const ITEM_CLASS =
  'flex h-full items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-4 py-3 transition-colors hover:border-[var(--border-hover)]'

/** 작은 표식(전이·누락) 공통 모양 */
const MARK_CLASS =
  'rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]'

/**
 * 의존성 분석기
 *
 * @param itemId - 분석 대상 항목 식별자
 * @param dependencies - "type:id" 형식의 의존성 문자열 목록
 *
 * @example
 * ```tsx
 * <DependencyResolver itemId="advanced-skill" dependencies={['mcp:github']} />
 * ```
 */
export function DependencyResolver({ itemId, dependencies }: DependencyResolverProps) {
  const [resolved, setResolved] = useState<DependencyResolutionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showTree, setShowTree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('detail.dependencies')

  // 직접 의존성이 하나도 없으면 카드 자체를 세우지 않는다
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
    const mcpInfo = dep.type === 'mcp' ? MCP_SERVERS[dep.id] : null

    const isInternalLink = dep.type === 'skill' || dep.type === 'agent'
    const href = isInternalLink ? `/${dep.type}/${dep.catalogItem?.id || dep.id}` : undefined

    const content = (
      <div className={`${ITEM_CLASS} ${!dep.direct ? 'opacity-70' : ''}`}>
        <span className="eyebrow shrink-0 pt-0.5">{TYPE_LABELS[dep.type] || TYPE_LABELS.other}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {dep.catalogItem?.name || dep.label}
            </span>
            {!dep.direct && <span className={MARK_CLASS}>transitive</span>}
            {!dep.available && (
              <span className={`${MARK_CLASS} text-[var(--brand-primary)]`}>missing</span>
            )}
          </div>
          {mcpInfo && (
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              {mcpInfo.description}
            </span>
          )}
          {dep.depth > 0 && (
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
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
    <div className="surface-card mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
            {t('title')}
          </h2>
          {resolved?.data && (
            <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
              {t('found', { count: resolved.data.totalCount })}
            </span>
          )}
        </div>
        <button
          onClick={fetchResolution}
          disabled={loading}
          className="rounded-full border border-[var(--border-hover)] px-3 py-1.5 font-mono text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] active:translate-y-px disabled:opacity-50"
        >
          {loading ? t('analyzing') : resolved ? t('reanalyzeButton') : t('analyzeButton')}
        </button>
      </div>

      {error && (
        <p className="mt-4 border-l-2 border-[var(--brand-primary)] pl-4 text-sm text-[var(--text-secondary)]">
          {error}
        </p>
      )}

      {/* 분석 전 — 직접 의존성만 보여준다 */}
      {!resolved && (
        <>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('description')}</p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {parsedDeps.map((dep, index) => {
              const mcpInfo = dep.type === 'mcp' ? MCP_SERVERS[dep.id] : null
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
        </>
      )}

      {/* 분석 후 */}
      {resolved?.data && (
        <>
          {/* 요약 수치 — 칸 사이를 1px 선으로만 나눈다 */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] md:grid-cols-4">
            {[
              { label: t('mcpServers'), value: resolved.data.summary.mcp },
              { label: t('skills'), value: resolved.data.summary.skills },
              { label: t('agents'), value: resolved.data.summary.agents },
              { label: t('unresolved'), value: resolved.data.summary.unresolved },
            ].map((stat) => (
              <div key={stat.label} className="bg-[var(--bg-primary)] px-5 py-4">
                <p className="eyebrow">{stat.label}</p>
                <p className="mt-1.5 font-mono text-2xl leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* 순환 의존성 경고 */}
          {resolved.data.hasCircularDependencies && (
            <div className="mt-4 border-l-2 border-[var(--brand-primary)] pl-4">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t('circularDetected')}
              </p>
              <p className="mt-1 font-mono text-xs break-all text-[var(--text-muted)]">
                {resolved.data.circularPaths.map((path) => path.join(' → ')).join('; ')}
              </p>
            </div>
          )}

          <button
            onClick={() => setShowTree(!showTree)}
            className="mt-4 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            {showTree ? t('showDirectOnly') : t('showFullTree')}
          </button>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(showTree
              ? resolved.data.dependencies
              : resolved.data.dependencies.filter((d) => d.direct)
            ).map(renderDependencyItem)}
          </div>

          {/* 권장 설치 순서 */}
          {showTree && resolved.data.installOrder.length > 0 && (
            <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
              <p className="eyebrow">{t('recommendedOrder')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {resolved.data.installOrder.map((id, i) => (
                  <span
                    key={id}
                    className="rounded-lg bg-[var(--bg-tertiary)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--text-secondary)]"
                  >
                    {i + 1}. {id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* MCP 서버 안내 */}
      {parsedDeps.some((d) => d.type === 'mcp') && (
        <p className="mt-4 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
          {t.rich('mcpHint', {
            command: () => (
              <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">
                claude mcp
              </code>
            ),
          })}
        </p>
      )}
    </div>
  )
}
