/**
 * User profile page
 *
 * Displays the authenticated user's profile information,
 * authored catalog items, and activity statistics.
 */
'use client'

import { useState, useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { CatalogItem, TAGS } from '@/lib/core/types'
import { useOrgContext } from '@/lib/hooks/useOrgContext'

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

interface Organization {
  id: string
  name: string
  slug: string
  role: string
}

/** 아이템 타입별 표기 — 아이콘 대신 짧은 대문자 라벨을 쓴다 */
const TYPE_CONFIG: Record<string, { label: string; href: string }> = {
  skill: { label: 'Skill', href: '/skill' },
  agent: { label: 'Agent', href: '/agent' },
  command: { label: 'Command', href: '/command' },
  hook: { label: 'Hook', href: '/hook' },
  guide: { label: 'Guide', href: '/guides' },
  package: { label: 'Package', href: '/package' },
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

type RelativeTimeTranslator = (key: string, values?: Record<string, number>) => string

function formatRelativeTime(dateString: string | null, t: RelativeTimeTranslator): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t('relativeTime.justNow')
  if (diffMins < 60) return t('relativeTime.minutesAgo', { count: diffMins })
  if (diffHours < 24) return t('relativeTime.hoursAgo', { count: diffHours })
  if (diffDays < 7) return t('relativeTime.daysAgo', { count: diffDays })
  return formatDate(dateString)
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { currentOrgId, switchOrg } = useOrgContext()
  const t = useTranslations('profile')

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

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const res = await fetch('/api/organizations')
        if (!res.ok) {
          throw new Error('Failed to fetch organizations')
        }
        const data = await res.json()
        setOrgs(data.organizations || [])
      } catch (err) {
        console.error('Failed to load organizations:', err)
      }
    }
    fetchOrganizations()
  }, [])

  if (loading) {
    return (
      <div className="page-shell items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="page-shell items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--text-secondary)]">{error || 'Failed to load profile'}</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-4 transition-colors"
          >
            ← Back to Catalog
          </Link>
        </div>
      </div>
    )
  }

  const { user, items, stats } = profile

  return (
    <div className="page-shell">
      <main className="page-main">
        {/* Profile Header */}
        <header className="mb-8 flex items-start gap-5">
          <div className="shrink-0">
            {user.image ? (
              <Image
                src={user.image}
                alt=""
                width={64}
                height={64}
                className="w-16 h-16 rounded-full"
                unoptimized
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)] text-xl font-medium">
                {user.name?.[0] || user.email[0]}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="page-title">{user.name || user.email.split('@')[0]}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{user.email}</p>

            <div className="mt-4 flex flex-wrap gap-6">
              <div>
                <p className="eyebrow">{t('joinDate')}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatDate(user.createdAt)}</p>
              </div>
              <div>
                <p className="eyebrow">{t('lastLogin')}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {formatRelativeTime(user.lastLoginAt, t)}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Organizations */}
        <section className="surface-card mb-6">
          <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">Organizations</h2>
          {orgs.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No organization memberships found.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {orgs.map((org) => (
                <li key={org.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-[var(--text-primary)] truncate">{org.name}</span>
                    <span className="eyebrow shrink-0">{org.role.replace('org_', '')}</span>
                    {org.id === currentOrgId && (
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-hover)] text-[var(--text-secondary)]">
                        Current
                      </span>
                    )}
                  </div>
                  {org.id !== currentOrgId && (
                    <button
                      onClick={() => switchOrg(org.id)}
                      className="shrink-0 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-4 transition-colors"
                    >
                      Switch to
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Stats band */}
        <div className="mb-10 grid grid-cols-3 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
          <div className="bg-[var(--bg-primary)] px-6 py-6">
            <p className="eyebrow">Total Items</p>
            <p className="mt-2 font-mono text-3xl tabular-nums tracking-tight text-[var(--text-primary)]">
              {stats.totalItems}
            </p>
          </div>
          <div className="bg-[var(--bg-primary)] px-6 py-6">
            <p className="eyebrow">Published</p>
            <p className="mt-2 font-mono text-3xl tabular-nums tracking-tight text-[var(--text-primary)]">
              {stats.published}
            </p>
          </div>
          <div className="bg-[var(--bg-primary)] px-6 py-6">
            <p className="eyebrow">Drafts</p>
            <p className="mt-2 font-mono text-3xl tabular-nums tracking-tight text-[var(--text-primary)]">
              {stats.drafts}
            </p>
          </div>
        </div>

        {/* Items List */}
        <section>
          <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)] mb-4">{t('myItems')}</h2>

          {items.length === 0 ? (
            <div className="surface-card text-center py-12">
              <p className="text-sm text-[var(--text-secondary)]">{t('noItems')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {items.map((item) => {
                const config = TYPE_CONFIG[item.type] || { label: item.type, href: '/item' }
                return (
                  <li key={item.id}>
                    <Link
                      href={`${config.href}/${item.id}`}
                      className="flex items-center justify-between gap-4 py-3 hover:bg-[var(--bg-tertiary)]/40 transition-colors -mx-2 px-2 rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-grow min-w-0">
                        <span className="eyebrow shrink-0 w-16">{config.label}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {item.name}
                            </h3>
                            {item.status === 'draft' && (
                              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-hover)] text-[var(--text-muted)]">
                                Draft
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{item.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 ml-4 shrink-0">
                        <div className="hidden sm:flex items-center gap-2">
                          {item.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                            >
                              {TAGS[tag]?.label || tag}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatRelativeTime(item.updatedAt || null, t)}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
