/**
 * Admin catalog management page
 *
 * Displays paginated catalog items with filtering, bulk operations,
 * and status management. Supports role-based permissions.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import type { UserRole } from '@/lib/security/rbac'
import { OrgBadge } from '@/components/ui/OrgBadge'
import { VisibilityBadge } from '@/components/ui/VisibilityBadge'
import { useToast } from '@/components/ui/Toast'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'

// RBAC helper functions
function canCreate(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'editor'
}

function canEdit(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'editor'
}

function canDelete(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'admin'
}

interface CatalogItem {
  id: string
  type: string
  name: string
  description: string
  authorId?: string
  authorName?: string
  tags: string[]
  status: 'draft' | 'published' | null
  version: string | null
  orgId: string | null
  visibility: 'private' | 'public' | null
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

interface Organization {
  id: string
  name: string
  slug: string
}

export default function CatalogList() {
  const { data: session } = useSession()
  const toast = useToast()
  const { confirm } = useConfirmDialog()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [organizations, setOrganizations] = useState<Organization[]>([])

  // Get user role from session
  const userRole = session?.user?.role as UserRole | undefined
  const isSuperAdmin = userRole === 'super_admin'

  const fetchItems = useCallback(async () => {
    try {
      const url = filter === 'all' ? '/api/catalog' : `/api/catalog?type=${filter}`
      const res = await fetch(url)
      const data = await res.json()
      setItems(data)
    } catch (error) {
      console.error('Failed to fetch items:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  const fetchOrganizations = useCallback(async () => {
    if (!isSuperAdmin) return
    try {
      const res = await fetch('/api/organizations')
      const data = await res.json()
      setOrganizations(data.organizations || [])
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
    }
  }, [isSuperAdmin])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  async function handleDelete(id: string) {
    if (!canDelete(userRole)) {
      toast.error('아이템 삭제 권한이 없습니다.')
      return
    }

    const confirmed = await confirm({
      title: '아이템 삭제',
      description: `"${id}" 항목을 정말 삭제하시겠습니까?`,
      variant: 'danger',
      confirmLabel: '삭제',
    })
    if (!confirmed) return

    try {
      const res = await fetch(`/api/catalog/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setItems(items.filter((item) => item.id !== id))
      } else if (res.status === 403) {
        toast.error('아이템 삭제 권한이 없습니다.')
      } else {
        toast.error('아이템 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to delete:', error)
      toast.error('아이템 삭제에 실패했습니다.')
    }
  }

  const filters = ['all', 'skill', 'agent', 'command', 'guide']

  // Create org lookup map
  const orgMap = new Map(organizations.map(org => [org.id, org.name]))

  // Filter items by org (client-side)
  let filteredItems = items

  if (orgFilter !== 'all') {
    if (orgFilter === 'legacy') {
      filteredItems = filteredItems.filter(item => item.orgId === null)
    } else {
      filteredItems = filteredItems.filter(item => item.orgId === orgFilter)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
            Catalog
          </h1>
          <p className="text-[var(--text-secondary)]">
            {filteredItems.length} items
          </p>
        </div>
        {canCreate(userRole) && (
          <Link
            href="/admin/catalog/new"
            className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            Create New
          </Link>
        )}
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
        {/* Org Filters (super_admin only) */}
        {isSuperAdmin && organizations.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider self-center mr-2">Org:</span>
            <button
              onClick={() => setOrgFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                orgFilter === 'all'
                  ? 'bg-[var(--accent-cyan)] text-black border-transparent'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setOrgFilter('legacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                orgFilter === 'legacy'
                  ? 'bg-[var(--accent-cyan)] text-black border-transparent'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              Legacy
            </button>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => setOrgFilter(org.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                  orgFilter === org.id
                    ? 'bg-[var(--accent-cyan)] text-black border-transparent'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                🏢 {org.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--text-muted)] mb-4">
            {items.length === 0 ? 'No items found' : 'No items match the selected filters'}
          </p>
          {items.length === 0 && canCreate(userRole) ? (
            <Link
              href="/admin/catalog/new"
              className="text-[var(--accent-cyan)] hover:underline"
            >
              Create your first item
            </Link>
          ) : items.length === 0 ? (
            <span className="text-[var(--text-muted)]">No items available</span>
          ) : (
            <button
              onClick={() => { setFilter('all'); }}
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
                  Organization
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Visibility
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
                      {item.version && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] font-mono">
                          v{item.version}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <OrgBadge orgName={item.orgId ? (orgMap.get(item.orgId) || item.orgId) : null} size="sm" />
                  </td>
                  <td className="px-6 py-4">
                    <VisibilityBadge visibility={item.visibility ?? null} size="sm" />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--text-muted)]">
                      @{item.authorName || 'Unknown'}
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
                      {canEdit(userRole) && (
                        <Link
                          href={`/admin/catalog/${item.id}/edit`}
                          className="px-3 py-1.5 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                        >
                          Edit
                        </Link>
                      )}
                      {canDelete(userRole) && (
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                          Delete
                        </button>
                      )}
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
