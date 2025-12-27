'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { TeamTag } from '@/lib/types'
import { useAdminAuth } from '@/lib/admin-auth'
import { TEAM_TAGS } from '@/lib/types'
import { TeamTagBadge } from '@/components/TeamTagSelector'

interface CatalogItem {
  id: string
  type: string
  name: string
  description: string
  author: string
  tags: string[]
  teamTag: TeamTag | null
  status: 'draft' | 'published' | null
  marketplaceVersion: string | null
  createdAt: string
  updatedAt: string
}

const TYPE_COLORS: Record<string, string> = {
  skill: 'text-cyan-400',
  agent: 'text-purple-400',
  command: 'text-rose-400',
  guide: 'text-emerald-400',
}

const TYPE_ICONS: Record<string, string> = {
  skill: '⚡',
  agent: '◈',
  command: '▸',
  guide: '📚',
}

export default function CatalogList() {
  const { password } = useAdminAuth()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [teamFilter, setTeamFilter] = useState<TeamTag | 'all'>('all')

  const fetchItems = useCallback(async () => {
    try {
      const url = filter === 'all' ? '/api/catalog' : `/api/catalog?type=${filter}`
      const res = await fetch(url, {
        headers: { 'x-admin-password': password || '' },
      })
      const data = await res.json()
      setItems(data)
    } catch (error) {
      console.error('Failed to fetch items:', error)
    } finally {
      setLoading(false)
    }
  }, [filter, password])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleDelete(id: string) {
    if (!confirm(`Are you sure you want to delete "${id}"?`)) return

    try {
      const res = await fetch(`/api/catalog/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password || '' },
      })

      if (res.ok) {
        setItems(items.filter((item) => item.id !== id))
      } else {
        alert('Failed to delete item')
      }
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete item')
    }
  }

  const filters = ['all', 'skill', 'agent', 'command', 'guide']
  const teamFilters: (TeamTag | 'all')[] = ['all', ...Object.keys(TEAM_TAGS) as TeamTag[]]

  // Filter items by team tag (client-side)
  const filteredItems = teamFilter === 'all'
    ? items
    : items.filter(item => item.teamTag === teamFilter)

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
            Catalog
          </h1>
          <p className="text-[var(--text-secondary)]">
            {filteredItems.length} items{teamFilter !== 'all' && ` (filtered from ${items.length})`}
          </p>
        </div>
        <Link
          href="/admin/catalog/new"
          className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
        >
          Create New
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-8">
        {/* Type Filters */}
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-[var(--accent-cyan)] text-black'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {/* Team Filters */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider self-center mr-2">Team:</span>
          {teamFilters.map((t) => {
            const isAll = t === 'all'
            const tagInfo = isAll ? null : TEAM_TAGS[t]
            return (
              <button
                key={t}
                onClick={() => setTeamFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                  teamFilter === t
                    ? isAll
                      ? 'bg-[var(--accent-cyan)] text-black border-transparent'
                      : tagInfo?.color
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                {tagInfo && <span>{tagInfo.emoji}</span>}
                <span>{isAll ? 'All' : tagInfo?.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--text-muted)] mb-4">
            {items.length === 0 ? 'No items found' : 'No items match the selected filters'}
          </p>
          {items.length === 0 ? (
            <Link
              href="/admin/catalog/new"
              className="text-[var(--accent-cyan)] hover:underline"
            >
              Create your first item
            </Link>
          ) : (
            <button
              onClick={() => { setFilter('all'); setTeamFilter('all'); }}
              className="text-[var(--accent-cyan)] hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Type
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  ID
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Name
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Status
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Team
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Author
                </th>
                <th className="text-right px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className={`${TYPE_COLORS[item.type]} flex items-center gap-2`}>
                      <span>{TYPE_ICONS[item.type]}</span>
                      <span className="text-xs uppercase tracking-wider">
                        {item.type}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-[var(--text-secondary)]">
                      {item.id}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[var(--text-primary)]">{item.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {item.status === 'draft' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          Draft
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                          Published
                        </span>
                      )}
                      {item.marketplaceVersion && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] font-mono">
                          v{item.marketplaceVersion}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {item.teamTag && (
                      <TeamTagBadge tag={item.teamTag} size="sm" />
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--text-muted)]">
                      @{item.author}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/${item.type === 'guide' ? 'guides' : item.type}/${item.id}`}
                        className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        target="_blank"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/catalog/${item.id}/edit`}
                        className="px-3 py-1.5 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
