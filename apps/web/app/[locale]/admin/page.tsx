/**
 * Admin dashboard page
 *
 * Main admin dashboard displaying statistics, recent activity,
 * draft items, and quick links to management sections.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@/i18n/navigation'
import { useSession } from 'next-auth/react'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'
import { useOrgContext } from '@/lib/hooks/useOrgContext'
import { useToast } from '@/components/ui/Toast'
import type { UserRole } from '@/lib/security/rbac'

interface Stats {
  total: number
  byType: {
    skill: number
    agent: number
    command: number
    guide: number
    hook: number
  }
  drafts: number
  published: number
  addedToday: number
}

interface RecentItem {
  id: string
  name: string
  type: string
  status: string | null
  author: string
  updatedAt: string
}

interface PopularItem {
  id: string
  name: string
  type: string
  likes: number
  author: string
}

interface DraftItem {
  id: string
  name: string
  type: string
  author: string
  updatedAt: string
}

interface DashboardData {
  stats: Stats
  recentActivity: RecentItem[]
  popularItems: PopularItem[]
  draftItems: DraftItem[]
}

// RBAC helper functions
function canCreate(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'editor'
}

function canEdit(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'editor'
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '방금 전'
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString('ko-KR')
}

/** 상태 배지 — 알약 배경 대신 점 하나와 글자 */
function StatusDot({ draft }: { draft: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 shrink-0 rounded-full ${draft ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent-green)]'}`} />
      <span className="text-[11px] text-[var(--text-secondary)]">{draft ? 'Draft' : 'Published'}</span>
    </span>
  )
}

export default function AdminDashboard() {
  useAdminAuth() // For layout protection
  const { data: session } = useSession()
  const userRole = session?.user?.role as UserRole | undefined
  const { currentOrgId } = useOrgContext()
  const toast = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [viewAll, setViewAll] = useState(false)
  const isSuperAdmin = userRole === 'super_admin'

  const fetchData = useCallback(async () => {
    try {
      const url = new URL('/api/admin/stats', window.location.origin)
      if (viewAll && isSuperAdmin) {
        url.searchParams.append('viewAll', 'true')
      }
      const res = await fetch(url.toString())
      const dashboardData = await res.json()
      setData(dashboardData)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [viewAll, isSuperAdmin])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  const handleQuickPublish = async (itemId: string) => {
    if (!canEdit(userRole)) {
      toast.error('발행 권한이 없습니다.')
      return
    }

    setPublishingId(itemId)
    try {
      const res = await fetch(`/api/catalog/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'published' }),
      })

      if (res.ok) {
        // Refresh data
        await fetchData()
      } else if (res.status === 403) {
        toast.error('권한이 없습니다.')
      } else {
        toast.error('발행에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to publish:', error)
      toast.error('발행에 실패했습니다.')
    } finally {
      setPublishingId(null)
    }
  }

  const statCards = [
    { label: '전체 아이템', value: data?.stats.total || 0 },
    { label: '오늘 추가', value: data?.stats.addedToday || 0 },
    { label: '미발행', value: data?.stats.drafts || 0 },
    { label: '발행됨', value: data?.stats.published || 0 },
  ]

  const typeCards = [
    { label: 'Skills', value: data?.stats.byType.skill || 0 },
    { label: 'Agents', value: data?.stats.byType.agent || 0 },
    { label: 'Commands', value: data?.stats.byType.command || 0 },
    { label: 'Guides', value: data?.stats.byType.guide || 0 },
  ]

  const quickActions = [
    { label: '새 Skill', href: '/admin/catalog/new?type=skill' },
    { label: '새 Agent', href: '/admin/catalog/new?type=agent' },
    { label: '새 Command', href: '/admin/catalog/new?type=command' },
    { label: '새 Guide', href: '/admin/catalog/new?type=guide' },
  ]

  return (
    <div>
      <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="page-title">대시보드</h1>
          <p className="page-subtitle">AI Toolkit 관리 센터</p>
        </div>

        {/* Organization Context Indicator */}
        <div className="flex items-center gap-3">
          <span className="eyebrow">
            {viewAll ? 'All organizations' : (currentOrgId ? `Org: ${currentOrgId}` : 'Current organization')}
          </span>

          {/* Super Admin Toggle */}
          {isSuperAdmin && (
            <button
              onClick={() => setViewAll(!viewAll)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                viewAll
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
              }`}
            >
              {viewAll ? 'All organizations' : 'Current org'}
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-[var(--text-muted)]">로딩 중...</div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Statistics Section */}
          <section>
            <h2 className="eyebrow mb-3">통계</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-[var(--border-subtle)]">
              {statCards.map((stat) => (
                <div
                  key={stat.label}
                  className="border-r border-b border-[var(--border-subtle)] p-4"
                >
                  <div className="font-mono text-2xl tabular-nums text-[var(--text-primary)]">
                    {stat.value}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Type breakdown */}
            <div className="grid grid-cols-4 border-l border-[var(--border-subtle)] mt-4">
              {typeCards.map((stat) => (
                <div
                  key={stat.label}
                  className="border-r border-t border-b border-[var(--border-subtle)] p-3 text-center"
                >
                  <div className="font-mono text-lg tabular-nums text-[var(--text-primary)]">
                    {stat.value}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Main Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Quick Actions + Drafts */}
            <div className="space-y-8">
              {/* Quick Actions */}
              {canCreate(userRole) && (
                <section>
                  <h2 className="eyebrow mb-3">빠른 작업</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {quickActions.map((action) => (
                      <Link
                        key={action.label}
                        href={action.href}
                        className="px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/admin/catalog"
                    className="mt-2 flex items-center justify-center px-4 py-2.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90 transition-opacity w-full"
                  >
                    전체 카탈로그 보기
                  </Link>
                </section>
              )}

              {/* Drafts List */}
              <section>
                <h2 className="eyebrow mb-3">미발행 아이템 ({data?.draftItems.length || 0})</h2>
                {data?.draftItems.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                    미발행 아이템이 없습니다
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                    {data?.draftItems.map((item) => (
                      <div
                        key={item.id}
                        className="py-3 hover:bg-[var(--bg-secondary)] transition-colors -mx-2 px-2"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                {item.type}
                              </span>
                              <span className="text-[var(--text-primary)] truncate text-sm">
                                {item.name}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                              {item.updatedAt && formatRelativeTime(item.updatedAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Link
                              href={`/admin/catalog/${item.id}/edit`}
                              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              편집
                            </Link>
                            {canEdit(userRole) && (
                              <button
                                onClick={() => handleQuickPublish(item.id)}
                                disabled={publishingId === item.id}
                                className="text-xs text-[var(--accent-green)] hover:opacity-80 transition-opacity disabled:opacity-50"
                              >
                                {publishingId === item.id ? '...' : '발행'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Middle Column: Recent Activity */}
            <div>
              <section>
                <h2 className="eyebrow mb-3">최근 수정</h2>
                {data?.recentActivity.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                    최근 수정된 아이템이 없습니다
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                    {data?.recentActivity.map((item) => (
                      <Link
                        key={item.id}
                        href={`/admin/catalog/${item.id}/edit`}
                        className="block py-3 hover:bg-[var(--bg-secondary)] transition-colors -mx-2 px-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">
                            {item.type}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[var(--text-primary)] truncate text-sm">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                              <span>@{item.author}</span>
                              <span>·</span>
                              <span className="font-mono">{item.updatedAt && formatRelativeTime(item.updatedAt)}</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <StatusDot draft={item.status === 'draft'} />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Right Column: Popular Items */}
            <div>
              <section>
                <h2 className="eyebrow mb-3">인기 스킬 Top 10</h2>
                {data?.popularItems.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                    아이템이 없습니다
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                    {data?.popularItems.map((item, index) => (
                      <Link
                        key={item.id}
                        href={`/${item.type === 'guide' ? 'guides' : item.type}/${item.id}`}
                        className="flex items-center gap-3 py-3 hover:bg-[var(--bg-secondary)] transition-colors -mx-2 px-2"
                      >
                        <span className="font-mono text-sm tabular-nums text-[var(--text-muted)] w-4 text-right shrink-0">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--text-primary)] truncate text-sm">
                            {item.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            @{item.author}
                          </div>
                        </div>
                        <span className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
                          {item.likes}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Data Management Section */}
          <section>
            <h2 className="eyebrow mb-3">데이터 관리</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Link
                href="/admin/tags"
                className="rounded-lg border border-[var(--border-subtle)] p-4 hover:border-[var(--border-hover)] transition-colors group"
              >
                <h3 className="text-[var(--text-primary)] font-medium">
                  태그
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  카탈로그 태그 관리
                </p>
              </Link>
              <Link
                href="/admin/mcp-servers"
                className="rounded-lg border border-[var(--border-subtle)] p-4 hover:border-[var(--border-hover)] transition-colors group"
              >
                <h3 className="text-[var(--text-primary)] font-medium">
                  MCP 서버
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  MCP 서버 정의 관리
                </p>
              </Link>
              <Link
                href="/admin/users"
                className="rounded-lg border border-[var(--border-subtle)] p-4 hover:border-[var(--border-hover)] transition-colors group"
              >
                <h3 className="text-[var(--text-primary)] font-medium">
                  사용자
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  사용자 권한 관리
                </p>
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
