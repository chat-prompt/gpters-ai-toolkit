/**
 * Admin user management page
 *
 * Displays user list with role management, last login tracking,
 * and search functionality. Admin-only access.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import type { UserRole } from '@/lib/security/rbac'

interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  role: UserRole
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

const ROLE_LABELS: Record<UserRole, { label: string; color: string }> = {
  admin: {
    label: 'Admin',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  editor: {
    label: 'Editor',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  viewer: {
    label: 'Viewer',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  },
}

const ROLE_OPTIONS: UserRole[] = ['admin', 'editor', 'viewer']

export default function UsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const currentUserRole = session?.user?.role as UserRole | undefined
  const canManageUsers = currentUserRole === 'admin'

  const fetchUsers = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        if (res.status === 403) {
          setError('You do not have permission to view users')
          return
        }
        throw new Error('Failed to fetch users')
      }
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function handleRoleChange(userId: string, newRole: UserRole) {
    if (!canManageUsers) return

    setUpdatingUserId(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to update role')
      }

      const updatedUser = await res.json()
      setUsers(users.map(u => u.id === userId ? updatedUser : u))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setUpdatingUserId(null)
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="text-[var(--text-muted)]">Loading users...</div>
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
      <div className="mb-8">
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Users
        </h1>
        <p className="text-[var(--text-secondary)]">
          {users.length} registered users
          {!canManageUsers && (
            <span className="ml-2 text-yellow-400">
              (View only - Admin role required to manage roles)
            </span>
          )}
        </p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                User
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                Email
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                Role
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                Last Login
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isCurrentUser = session?.user?.id === user.id
              const roleInfo = ROLE_LABELS[user.role]

              return (
                <tr
                  key={user.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <Image
                          src={user.image}
                          alt={user.name || 'User'}
                          width={32}
                          height={32}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)]">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-[var(--text-primary)]">
                        {user.name || 'Unknown'}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-[var(--accent-cyan)]">(you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-[var(--text-secondary)]">
                      {user.email}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    {canManageUsers && !isCurrentUser ? (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        disabled={updatingUserId === user.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${roleInfo.color} bg-transparent`}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                            {ROLE_LABELS[role].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-block px-3 py-1.5 rounded-lg text-xs font-medium border ${roleInfo.color}`}
                      >
                        {roleInfo.label}
                      </span>
                    )}
                    {updatingUserId === user.id && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">Updating...</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--text-muted)]">
                      {formatDate(user.lastLoginAt)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--text-muted)]">
                      {formatDate(user.createdAt)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Role descriptions */}
      <div className="mt-8 glass rounded-2xl p-6">
        <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">Role Descriptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-medium border ${ROLE_LABELS.admin.color}`}>
                Admin
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Full access to all admin features including user management, catalog CRUD operations, and settings.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-medium border ${ROLE_LABELS.editor.color}`}>
                Editor
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Can create and edit catalog items, manage tags and authors, but cannot delete items or manage users.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-medium border ${ROLE_LABELS.viewer.color}`}>
                Viewer
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Read-only access to the admin dashboard. Can view all data but cannot make any changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
