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
import { canManageUsers, type UserRole } from '@/lib/security/rbac'
import { useToast } from '@/components/ui/Toast'
import { AllowedAccountsPanel } from '@/components/admin'

interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  role: UserRole
  accountStatus: 'active' | 'suspended'
  deactivatedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

/** 역할별 표시 이름과 점 색 — 권한이 높을수록 눈에 띄는 색을 쓴다 */
const ROLE_LABELS: Record<UserRole, { label: string; dot: string }> = {
  super_admin: { label: 'Super Admin', dot: 'bg-[var(--accent-orange)]' },
  admin: { label: 'Admin', dot: 'bg-[var(--accent-orange)]' },
  editor: { label: 'Editor', dot: 'bg-[var(--text-secondary)]' },
  viewer: { label: 'Viewer', dot: 'bg-[var(--text-muted)]' },
}

const ROLE_OPTIONS: UserRole[] = ['super_admin', 'admin', 'editor', 'viewer']

/** 역할 배지 — 알약 배경 대신 점 하나와 글자 */
function RoleBadge({ role }: { role: UserRole }) {
  const info = ROLE_LABELS[role]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
      <span className={`size-1.5 shrink-0 rounded-full ${info.dot}`} />
      {info.label}
    </span>
  )
}

export default function UsersPage() {
  const { data: session } = useSession()
  const toast = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const currentUserRole = session?.user?.role as UserRole | undefined
  const canManageRoles = canManageUsers(currentUserRole)
  const canManageExternalAccess = currentUserRole === 'super_admin'

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
    if (!canManageRoles) return

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
      toast.error(err instanceof Error ? err.message : '역할 변경에 실패했습니다.')
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
      <div className="text-[var(--text-muted)]">Loading users...</div>
    )
  }

  if (error) {
    return (
      <div className="text-[var(--accent-orange)]">{error}</div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">
          {users.filter(user => user.accountStatus === 'active').length} active · {users.length} registered users
          {!canManageRoles && (
            <span className="ml-2 text-[var(--accent-orange)]">
              (View only - Admin role required to manage roles)
            </span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="eyebrow text-left px-3 py-2 font-normal">User</th>
              <th className="eyebrow text-left px-3 py-2 font-normal">Email</th>
              <th className="eyebrow text-left px-3 py-2 font-normal">Role</th>
              <th className="eyebrow text-left px-3 py-2 font-normal">Status</th>
              <th className="eyebrow text-left px-3 py-2 font-normal">Last Login</th>
              <th className="eyebrow text-left px-3 py-2 font-normal">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {users.map((user) => {
              const isCurrentUser = session?.user?.id === user.id

              return (
                <tr
                  key={user.id}
                  className={`hover:bg-[var(--bg-secondary)] transition-colors ${user.accountStatus === 'active' ? '' : 'opacity-60'}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <Image
                          src={user.image}
                          alt={user.name || 'User'}
                          width={28}
                          height={28}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)] text-xs">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-[var(--text-primary)]">
                        {user.name || 'Unknown'}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-[var(--text-muted)]">(you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="font-mono text-xs text-[var(--text-secondary)]">
                      {user.email}
                    </code>
                  </td>
                  <td className="px-3 py-2.5">
                    {canManageRoles && !isCurrentUser ? (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        disabled={updatingUserId === user.id}
                        className="px-2 py-1 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] cursor-pointer"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                            {ROLE_LABELS[role].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={user.role} />
                    )}
                    {updatingUserId === user.id && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">Updating...</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={user.accountStatus === 'active' ? 'text-[var(--accent-green)]' : 'text-[var(--accent-orange)]'}>
                      {user.accountStatus === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      {formatDate(user.lastLoginAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      {formatDate(user.createdAt)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canManageExternalAccess && <AllowedAccountsPanel />}

      {/* Role descriptions */}
      <div className="mt-8">
        <h2 className="eyebrow mb-3">Role Descriptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-[var(--border-subtle)]">
            <RoleBadge role="admin" />
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Full access to all admin features including user management, catalog CRUD operations, and settings.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-[var(--border-subtle)]">
            <RoleBadge role="editor" />
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Can create and edit catalog items, manage tags and authors, but cannot delete items or manage users.
            </p>
          </div>
          <div className="p-4 rounded-lg border border-[var(--border-subtle)]">
            <RoleBadge role="viewer" />
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Read-only access to the admin dashboard. Can view all data but cannot make any changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
