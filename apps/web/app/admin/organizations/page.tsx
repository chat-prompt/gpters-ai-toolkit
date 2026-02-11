/**
 * Admin organizations list page
 *
 * Displays organization list with member count, status, and creation date.
 * super_admin: Shows all organizations with create button
 * org_admin: Shows only their organizations
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
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
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="text-[var(--text-muted)]">Loading organizations...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
            Organizations
          </h1>
          <p className="text-[var(--text-secondary)]">
            {organizations.length} organization{organizations.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/admin/organizations/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            <span className="text-lg">+</span>
            Create Organization
          </Link>
        )}
      </div>

      {organizations.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">🏢</div>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
            >
              <span className="text-lg">+</span>
              Create Organization
            </Link>
          )}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Organization
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Slug
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Members
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Status
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr
                  key={org.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="flex items-start gap-3 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">🏢</span>
                      </div>
                      <div>
                        <div className="text-[var(--text-primary)] font-medium group-hover:text-[var(--accent-cyan)] transition-colors">
                          {org.name}
                        </div>
                        {org.description && (
                          <div className="text-sm text-[var(--text-muted)] line-clamp-1">
                            {org.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-[var(--text-secondary)]">
                      {org.slug}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <span className="text-sm">
                        {org.memberCount !== undefined ? `${org.memberCount} members` : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium border ${
                        org.isActive
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                      }`}
                    >
                      {org.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--text-muted)]">
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
