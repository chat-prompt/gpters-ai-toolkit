'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CatalogItem, TAGS } from '@/lib/core/types'

interface UserProfile {
  user: {
    id: string
    email: string
    name: string | null
    image: string | null
    lastLoginAt: string | null
    createdAt: string | null
  }
  items: CatalogItem[]
  stats: {
    totalItems: number
    published: number
    drafts: number
    totalLikes: number
  }
}

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; href: string }> = {
  skill: { label: 'Skill', icon: '⚡', color: 'text-[var(--accent-cyan)]', href: '/skill' },
  agent: { label: 'Agent', icon: '◈', color: 'text-[var(--accent-purple)]', href: '/agent' },
  command: { label: 'Command', icon: '▸', color: 'text-rose-400', href: '/command' },
  hook: { label: 'Hook', icon: '🪝', color: 'text-orange-400', href: '/hook' },
  guide: { label: 'Guide', icon: '📚', color: 'text-emerald-400', href: '/guides' },
  package: { label: 'Package', icon: '📦', color: 'text-amber-400', href: '/package' },
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '-'
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
  return formatDate(dateString)
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/user')
        if (!res.ok) {
          throw new Error('Failed to fetch profile')
        }
        const data = await res.json()
        setProfile(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-20">⚠️</div>
          <p className="text-[var(--text-secondary)]">{error || 'Failed to load profile'}</p>
          <Link href="/" className="text-[var(--accent-cyan)] hover:underline mt-4 inline-block">
            ← Back to Catalog
          </Link>
        </div>
      </div>
    )
  }

  const { user, items, stats } = profile

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
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
        {/* Profile Header */}
        <div className="glass rounded-2xl p-8 mb-8">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {user.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-full"
                  unoptimized
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[var(--accent-cyan)] flex items-center justify-center text-black text-2xl font-medium">
                  {user.name?.[0] || user.email[0]}
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-grow">
              <h1 className="text-2xl font-medium text-[var(--text-primary)] mb-1">
                {user.name || user.email.split('@')[0]}
              </h1>
              <p className="text-sm text-[var(--text-muted)] mb-4">{user.email}</p>

              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-[var(--text-muted)]">가입일: </span>
                  <span className="text-[var(--text-secondary)]">{formatDate(user.createdAt)}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">마지막 로그인: </span>
                  <span className="text-[var(--text-secondary)]">{formatRelativeTime(user.lastLoginAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="glass rounded-xl p-4 text-center">
            <div className="text-2xl font-light text-[var(--text-primary)]">{stats.totalItems}</div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Total Items</div>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <div className="text-2xl font-light text-emerald-400">{stats.published}</div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Published</div>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <div className="text-2xl font-light text-yellow-400">{stats.drafts}</div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Drafts</div>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <div className="text-2xl font-light text-rose-400">{stats.totalLikes}</div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">Total Likes</div>
          </div>
        </div>

        {/* MCP Tokens Section */}
        <div className="glass rounded-xl p-5 mb-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔑</span>
              <div>
                <h3 className="text-base font-medium text-[var(--text-primary)]">MCP API Tokens</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Claude Code MCP 서버 연결을 위한 토큰을 관리합니다.
                </p>
              </div>
            </div>
            <Link
              href="/profile/tokens"
              className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-cyan)] transition-colors text-sm"
            >
              토큰 관리 →
            </Link>
          </div>
        </div>

        {/* Items List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">내 아이템</h2>
            <Link
              href="/upload"
              className="text-sm text-[var(--accent-cyan)] hover:underline flex items-center gap-1"
            >
              <span>+</span>
              <span>새 아이템 추가</span>
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="text-4xl mb-4 opacity-20">📝</div>
              <p className="text-[var(--text-secondary)] mb-4">아직 생성한 아이템이 없습니다.</p>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-cyan)] text-black text-sm font-medium hover:opacity-90 transition-opacity"
              >
                첫 번째 아이템 만들기
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const config = TYPE_CONFIG[item.type] || { label: item.type, icon: '📄', color: 'text-gray-400', href: '/item' }
                return (
                  <Link
                    key={item.id}
                    href={`${config.href}/${item.id}`}
                    className="block glass rounded-xl p-4 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-grow min-w-0">
                        <span className={`text-lg ${config.color}`}>{config.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {item.name}
                            </h3>
                            {item.status === 'draft' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                Draft
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          {item.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                            >
                              {TAGS[tag]?.label || tag}
                            </span>
                          ))}
                        </div>
                        {item.likes > 0 && (
                          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                            <span className="text-rose-400">♥</span>
                            {item.likes}
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatRelativeTime(item.updatedAt || null)}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
