/**
 * Admin catalog management page
 *
 * Displays paginated catalog items with filtering, bulk operations,
 * and status management. Supports role-based permissions.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@/i18n/navigation'
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

interface Organization {
  id: string
  name: string
  slug: string
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
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="page-title">Catalog</h1>
          <p className="page-subtitle">{filteredItems.length} items</p>
        </div>
        {canCreate(userRole) && (
          <Link
            href="/admin/catalog/new"
            className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Create New
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Type Filters */}
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {/* Org Filters (super_admin only) */}
        {isSuperAdmin && organizations.length > 0 && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="eyebrow mr-1">Org</span>
            <button
              onClick={() => setOrgFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                orgFilter === 'all'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setOrgFilter('legacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                orgFilter === 'legacy'
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Legacy
            </button>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => setOrgFilter(org.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  orgFilter === org.id
                    ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {org.name}
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
              className="text-[var(--text-primary)] hover:underline"
            >
              Create your first item
            </Link>
          ) : items.length === 0 ? (
            <span className="text-[var(--text-muted)]">No items available</span>
          ) : (
            <button
              onClick={() => { setFilter('all'); }}
              className="text-[var(--text-primary)] hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="eyebrow text-left px-3 py-2 font-normal">Type</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">ID</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Name</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Status</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Organization</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Visibility</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Author</th>
                <th className="eyebrow text-right px-3 py-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="font-mono text-xs text-[var(--text-secondary)]">
                      {item.id}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[var(--text-primary)]">{item.name}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot draft={item.status === 'draft'} />
                      {item.version && (
                        <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                          v{item.version}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <OrgBadge orgName={item.orgId ? (orgMap.get(item.orgId) || item.orgId) : null} size="sm" />
                  </td>
                  <td className="px-3 py-2.5">
                    <VisibilityBadge visibility={item.visibility ?? null} size="sm" />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      @{item.authorName || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/${item.type === 'guide' ? 'guides' : item.type}/${item.id}`}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        target="_blank"
                      >
                        View
                      </Link>
                      {canEdit(userRole) && (
                        <Link
                          href={`/admin/catalog/${item.id}/edit`}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          Edit
                        </Link>
                      )}
                      {canDelete(userRole) && (
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-xs text-[var(--accent-orange)] hover:opacity-80 transition-opacity"
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
