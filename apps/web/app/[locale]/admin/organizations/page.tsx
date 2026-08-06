/**
 * Admin organizations list page
 *
 * Displays organization list with member count, status, and creation date.
 * super_admin: Shows all organizations with create button
 * org_admin: Shows only their organizations
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@/i18n/navigation'
import { useSession } from 'next-auth/react'

interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  allowedDomains: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  memberCount?: number
}

/** 활성/비활성 배지 — 알약 배경 대신 점 하나와 글자 */
function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 shrink-0 rounded-full ${active ? 'bg-[var(--accent-green)]' : 'bg-[var(--text-muted)]'}`} />
      <span className="text-xs text-[var(--text-secondary)]">{active ? 'Active' : 'Inactive'}</span>
    </span>
  )
}

export default function OrganizationsPage() {
  const { data: session } = useSession()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isSuperAdmin = session?.user?.role === 'super_admin'

  const fetchOrganizations = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/organizations')
      if (!res.ok) {
        if (res.status === 403) {
          setError('You do not have permission to view organizations')
          return
        }
        throw new Error('Failed to fetch organizations')
      }
      const data = await res.json()

      const orgsWithCounts = await Promise.all(
        data.organizations.map(async (org: Organization) => {
          try {
            const membersRes = await fetch(`/api/organizations/${org.id}/members`)
            if (membersRes.ok) {
              const membersData = await membersRes.json()
              return { ...org, memberCount: membersData.members?.length || 0 }
            }
            return org
          } catch {
            return org
          }
        })
      )

      setOrganizations(orgsWithCounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch organizations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="text-[var(--text-muted)]">Loading organizations...</div>
    )
  }

  if (error) {
    return (
      <div className="text-[var(--accent-orange)]">{error}</div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Organizations</h1>
          <p className="page-subtitle">
            {organizations.length} organization{organizations.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/admin/organizations/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Create Organization
          </Link>
        )}
      </div>

      {organizations.length === 0 ? (
        <div className="surface-card rounded-2xl p-12 text-center">
          <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">
            No organizations yet
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            {isSuperAdmin
              ? 'Create your first organization to get started.'
              : 'You are not a member of any organizations yet.'}
          </p>
          {isSuperAdmin && (
            <Link
              href="/admin/organizations/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90 transition-opacity"
            >
              + Create Organization
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="eyebrow text-left px-3 py-2 font-normal">Organization</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Slug</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Members</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Status</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {organizations.map((org) => (
                <tr
                  key={org.id}
                  className="hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="group"
                    >
                      <div className="text-[var(--text-primary)] font-medium group-hover:underline">
                        {org.name}
                      </div>
                      {org.description && (
                        <div className="text-xs text-[var(--text-muted)] line-clamp-1">
                          {org.description}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="font-mono text-xs text-[var(--text-secondary)]">
                      {org.slug}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {org.memberCount !== undefined ? org.memberCount : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ActiveDot active={org.isActive} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      {formatDate(org.createdAt)}
                    </span>
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
