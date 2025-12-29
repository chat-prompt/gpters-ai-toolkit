'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'
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

const TYPE_COLORS: Record<string, string> = {
  skill: 'text-cyan-400',
  agent: 'text-purple-400',
  command: 'text-rose-400',
  guide: 'text-emerald-400',
  hook: 'text-yellow-400',
}

const TYPE_ICONS: Record<string, string> = {
  skill: '⚡',
  agent: '◈',
  command: '▸',
  guide: '📚',
  hook: '🪝',
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

export default function AdminDashboard() {
  const { password } = useAdminAuth()
  const { data: session } = useSession()
  const userRole = session?.user?.role as UserRole | undefined
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-password': password || '' },
      })
      const dashboardData = await res.json()
      setData(dashboardData)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleQuickPublish = async (itemId: string) => {
    if (!canEdit(userRole)) {
      alert('발행 권한이 없습니다.')
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
        alert('권한이 없습니다.')
      } else {
        alert('발행 실패')
      }
    } catch (error) {
      console.error('Failed to publish:', error)
      alert('발행 실패')
    } finally {
      setPublishingId(null)
    }
  }

  const statCards = [
    { label: '전체 아이템', value: data?.stats.total || 0, icon: '📦', color: 'cyan' },
    { label: '오늘 추가', value: data?.stats.addedToday || 0, icon: '✨', color: 'green' },
    { label: '미발행', value: data?.stats.drafts || 0, icon: '📝', color: 'yellow' },
    { label: '발행됨', value: data?.stats.published || 0, icon: '✅', color: 'emerald' },
  ]

  const typeCards = [
    { label: 'Skills', value: data?.stats.byType.skill || 0, color: 'cyan' },
    { label: 'Agents', value: data?.stats.byType.agent || 0, color: 'purple' },
    { label: 'Commands', value: data?.stats.byType.command || 0, color: 'rose' },
    { label: 'Guides', value: data?.stats.byType.guide || 0, color: 'emerald' },
  ]

  const quickActions = [
    { label: '새 Skill', href: '/admin/catalog/new?type=skill', icon: '⚡', color: 'cyan' },
    { label: '새 Agent', href: '/admin/catalog/new?type=agent', icon: '◈', color: 'purple' },
    { label: '새 Command', href: '/admin/catalog/new?type=command', icon: '▸', color: 'rose' },
    { label: '새 Guide', href: '/admin/catalog/new?type=guide', icon: '📚', color: 'emerald' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          대시보드
        </h1>
        <p className="text-[var(--text-secondary)]">
          GPTers AI Toolkit 관리 센터
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-[var(--text-muted)]">로딩 중...</div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Statistics Section */}
          <section>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <span>📊</span> 통계
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statCards.map((stat) => (
                <div
                  key={stat.label}
                  className="glass rounded-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{stat.icon}</span>
                  </div>
                  <div className="text-3xl font-light text-[var(--text-primary)] mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Type breakdown */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              {typeCards.map((stat) => (
                <div
                  key={stat.label}
                  className="glass rounded-lg p-4 text-center"
                >
                  <div className="text-2xl font-light text-[var(--text-primary)]">
                    {stat.value}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
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
                  <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
                    <span>🚀</span> 빠른 작업
                  </h2>
                  <div className="glass rounded-xl p-6">
                    <div className="grid grid-cols-2 gap-3">
                      {quickActions.map((action) => (
                        <Link
                          key={action.label}
                          href={action.href}
                          className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <span className="text-lg">{action.icon}</span>
                          <span className="text-sm">{action.label}</span>
                        </Link>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                      <Link
                        href="/admin/catalog"
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity w-full"
                      >
                        전체 카탈로그 보기
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              {/* Drafts List */}
              <section>
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <span>📝</span> 미발행 아이템 ({data?.draftItems.length || 0})
                </h2>
                <div className="glass rounded-xl overflow-hidden">
                  {data?.draftItems.length === 0 ? (
                    <div className="p-6 text-center text-[var(--text-muted)]">
                      미발행 아이템이 없습니다
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {data?.draftItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`${TYPE_COLORS[item.type]} text-sm`}>
                                  {TYPE_ICONS[item.type]}
                                </span>
                                <span className="text-[var(--text-primary)] truncate text-sm">
                                  {item.name}
                                </span>
                              </div>
                              <div className="text-xs text-[var(--text-muted)] mt-1">
                                {item.updatedAt && formatRelativeTime(item.updatedAt)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Link
                                href={`/admin/catalog/${item.id}/edit`}
                                className="px-2.5 py-1 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                              >
                                편집
                              </Link>
                              {canEdit(userRole) && (
                                <button
                                  onClick={() => handleQuickPublish(item.id)}
                                  disabled={publishingId === item.id}
                                  className="px-2.5 py-1 rounded text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
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
                </div>
              </section>
            </div>

            {/* Middle Column: Recent Activity */}
            <div>
              <section>
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <span>🔔</span> 최근 수정
                </h2>
                <div className="glass rounded-xl overflow-hidden">
                  {data?.recentActivity.length === 0 ? (
                    <div className="p-6 text-center text-[var(--text-muted)]">
                      최근 수정된 아이템이 없습니다
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {data?.recentActivity.map((item) => (
                        <Link
                          key={item.id}
                          href={`/admin/catalog/${item.id}/edit`}
                          className="block p-4 hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`${TYPE_COLORS[item.type]} text-lg`}>
                              {TYPE_ICONS[item.type]}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[var(--text-primary)] truncate text-sm">
                                {item.name}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                                <span>@{item.author}</span>
                                <span>·</span>
                                <span>{item.updatedAt && formatRelativeTime(item.updatedAt)}</span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              {item.status === 'draft' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                  Draft
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                  Published
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Right Column: Popular Items */}
            <div>
              <section>
                <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <span>🏆</span> 인기 스킬 Top 10
                </h2>
                <div className="glass rounded-xl overflow-hidden">
                  {data?.popularItems.length === 0 ? (
                    <div className="p-6 text-center text-[var(--text-muted)]">
                      아이템이 없습니다
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {data?.popularItems.map((item, index) => (
                        <Link
                          key={item.id}
                          href={`/${item.type === 'guide' ? 'guides' : item.type}/${item.id}`}
                          className="flex items-center gap-4 p-4 hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <span className="text-lg font-light text-[var(--text-muted)] w-6 text-center">
                            {index + 1}
                          </span>
                          <span className={`${TYPE_COLORS[item.type]} text-lg`}>
                            {TYPE_ICONS[item.type]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[var(--text-primary)] truncate text-sm">
                              {item.name}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              @{item.author}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[var(--text-muted)]">
                            <span className="text-rose-400">❤️</span>
                            <span className="text-sm">{item.likes}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Data Management Section */}
          <section>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <span>⚙️</span> 데이터 관리
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Link
                href="/admin/tags"
                className="glass p-6 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">🏷️</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                  태그
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  카탈로그 태그 관리
                </p>
              </Link>
              <Link
                href="/admin/authors"
                className="glass p-6 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">👤</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                  작성자
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  콘텐츠 작성자 관리
                </p>
              </Link>
              <Link
                href="/admin/mcp-servers"
                className="glass p-6 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">🔌</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                  MCP 서버
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  MCP 서버 정의 관리
                </p>
              </Link>
              <Link
                href="/admin/users"
                className="glass p-6 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors group"
              >
                <div className="text-2xl mb-2">👥</div>
                <h3 className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
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
