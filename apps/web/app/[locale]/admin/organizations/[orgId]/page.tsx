/**
 * Admin organization detail and settings page
 *
 * Displays organization info, members, and domains with management capabilities.
 * org_admin or super_admin can edit organization details and manage members/domains.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Link } from '@/i18n/navigation'
import { useSession } from 'next-auth/react'
import { useParams } from 'next/navigation'
import type { OrgRole } from '@/lib/security/rbac'
import { useToast } from '@/components/ui/Toast'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  allowedDomains: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  memberCount: number
}

interface Member {
  userId: string
  name: string | null
  email: string
  role: OrgRole
  joinedAt: string
}

/** 조직 내 역할별 표시 이름과 점 색 */
const ORG_ROLE_LABELS: Record<OrgRole, { label: string; dot: string }> = {
  org_admin: { label: 'Admin', dot: 'bg-[var(--accent-orange)]' },
  org_editor: { label: 'Editor', dot: 'bg-[var(--text-secondary)]' },
  org_viewer: { label: 'Viewer', dot: 'bg-[var(--text-muted)]' },
}

const ORG_ROLE_OPTIONS: OrgRole[] = ['org_admin', 'org_editor', 'org_viewer']

/** 폼 입력 공통 클래스 */
const inputClass =
  'w-full px-4 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-colors'

/** 폼 라벨 공통 클래스 */
const labelClass = 'block text-sm font-medium text-[var(--text-secondary)] mb-2'

/** 역할 배지 — 알약 배경 대신 점 하나와 글자 */
function OrgRoleBadge({ role }: { role: OrgRole }) {
  const info = ORG_ROLE_LABELS[role]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
      <span className={`size-1.5 shrink-0 rounded-full ${info.dot}`} />
      {info.label}
    </span>
  )
}

export default function OrganizationDetailPage() {
  const params = useParams()
  const { data: session } = useSession()
  const toast = useToast()
  const { confirm: confirmDialog } = useConfirmDialog()
  const orgId = params.orgId as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('org_viewer')
  const [inviting, setInviting] = useState(false)

  const [newDomain, setNewDomain] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)

  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [removingDomain, setRemovingDomain] = useState<string | null>(null)

  const isSuperAdmin = session?.user?.role === 'super_admin'
  const currentUserMembership = members.find(m => m.userId === session?.user?.id)
  const isOrgAdmin = currentUserMembership?.role === 'org_admin'
  const canEdit = isSuperAdmin || isOrgAdmin

  const fetchOrganization = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/organizations/${orgId}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Organization not found')
          return
        }
        throw new Error('Failed to fetch organization')
      }
      const data = await res.json()
      setOrg(data)
      setEditName(data.name)
      setEditDescription(data.description || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch organization')
    }
  }, [orgId])

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`)
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members || [])
      }
    } catch (err) {
      console.error('Failed to fetch members:', err)
    }
  }, [orgId])

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/domains`)
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains || [])
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err)
    }
  }, [orgId])

  useEffect(() => {
    Promise.all([fetchOrganization(), fetchMembers(), fetchDomains()]).finally(() =>
      setLoading(false)
    )
  }, [fetchOrganization, fetchMembers, fetchDomains])

  async function handleSave() {
    if (!canEdit) return

    setSaving(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription || null,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to update organization')
      }

      const updatedOrg = await res.json()
      setOrg(updatedOrg)
      setEditMode(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '조직 정보 업데이트에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!isSuperAdmin || !org) return

    const confirmed = await confirmDialog({
      title: org.isActive ? '조직 비활성화' : '조직 활성화',
      description: `이 조직을 ${org.isActive ? '비활성화' : '활성화'}하시겠습니까?`,
      variant: org.isActive ? 'danger' : 'default',
      confirmLabel: org.isActive ? '비활성화' : '활성화',
    })
    if (!confirmed) return

    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !org.isActive }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to update organization')
      }

      const updatedOrg = await res.json()
      setOrg(updatedOrg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '조직 정보 업데이트에 실패했습니다.')
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit || !inviteEmail) return

    setInviting(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to invite member')
      }

      setInviteEmail('')
      setInviteRole('org_viewer')
      await fetchMembers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '멤버 초대에 실패했습니다.')
    } finally {
      setInviting(false)
    }
  }

  async function handleChangeRole(userId: string, newRole: OrgRole) {
    if (!canEdit) return

    setUpdatingMemberId(userId)
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to update role')
      }

      await fetchMembers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '역할 변경에 실패했습니다.')
    } finally {
      setUpdatingMemberId(null)
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!canEdit) return

    const confirmed = await confirmDialog({
      title: '멤버 제거',
      description: '이 멤버를 정말 제거하시겠습니까?',
      variant: 'danger',
      confirmLabel: '제거',
    })
    if (!confirmed) return

    setRemovingMemberId(userId)
    try {
      const res = await fetch(`/api/organizations/${orgId}/members?userId=${userId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to remove member')
      }

      await fetchMembers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '멤버 제거에 실패했습니다.')
    } finally {
      setRemovingMemberId(null)
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit || !newDomain) return

    setAddingDomain(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to add domain')
      }

      setNewDomain('')
      await fetchDomains()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '도메인 추가에 실패했습니다.')
    } finally {
      setAddingDomain(false)
    }
  }

  async function handleRemoveDomain(domain: string) {
    if (!canEdit) return

    const confirmed = await confirmDialog({
      title: '도메인 제거',
      description: `"${domain}" 도메인을 정말 제거하시겠습니까?`,
      variant: 'danger',
      confirmLabel: '제거',
    })
    if (!confirmed) return

    setRemovingDomain(domain)
    try {
      const res = await fetch(`/api/organizations/${orgId}/domains?domain=${encodeURIComponent(domain)}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to remove domain')
      }

      await fetchDomains()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '도메인 제거에 실패했습니다.')
    } finally {
      setRemovingDomain(null)
    }
  }

  function formatDate(dateString: string): string {
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
      <div className="text-[var(--text-muted)]">Loading organization...</div>
    )
  }

  if (error || !org) {
    return (
      <div>
        <div className="text-[var(--accent-orange)]">{error || 'Organization not found'}</div>
        <Link
          href="/admin/organizations"
          className="mt-4 inline-block text-[var(--text-primary)] hover:underline"
        >
          ← Back to Organizations
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/organizations"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 inline-block"
        >
          ← Back to Organizations
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-title">{org.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <code className="font-mono text-sm text-[var(--text-secondary)]">{org.slug}</code>
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-1.5 shrink-0 rounded-full ${org.isActive ? 'bg-[var(--accent-green)]' : 'bg-[var(--text-muted)]'}`} />
                <span className="text-xs text-[var(--text-secondary)]">{org.isActive ? 'Active' : 'Inactive'}</span>
              </span>
            </div>
          </div>
          {isSuperAdmin && (
            <button
              onClick={handleToggleActive}
              className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-sm"
            >
              {org.isActive ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="surface-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-medium text-[var(--text-primary)]">
              Organization Info
            </h2>
            {canEdit && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
              >
                Edit
              </button>
            )}
          </div>

          {editMode ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditMode(false)
                    setEditName(org.name)
                    setEditDescription(org.description || '')
                  }}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="eyebrow mb-1">Name</div>
                <div className="text-[var(--text-primary)]">{org.name}</div>
              </div>
              <div>
                <div className="eyebrow mb-1">Slug</div>
                <code className="font-mono text-sm text-[var(--text-secondary)]">{org.slug}</code>
              </div>
              {org.description && (
                <div>
                  <div className="eyebrow mb-1">Description</div>
                  <div className="text-[var(--text-primary)]">{org.description}</div>
                </div>
              )}
              <div>
                <div className="eyebrow mb-1">Created</div>
                <div className="font-mono text-sm text-[var(--text-secondary)]">{formatDate(org.createdAt)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="surface-card rounded-2xl p-6">
          <h2 className="text-xl font-medium text-[var(--text-primary)] mb-4">
            Members ({members.length})
          </h2>

          {canEdit && (
            <form onSubmit={handleInviteMember} className="mb-6 p-4 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="flex gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Email address"
                  className={`flex-1 ${inputClass}`}
                />
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as OrgRole)}
                  className={inputClass}
                >
                  {ORG_ROLE_OPTIONS.map(role => (
                    <option key={role} value={role}>
                      {ORG_ROLE_LABELS[role].label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail}
                  className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                >
                  {inviting ? 'Inviting...' : 'Invite'}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {members.map(member => {
              const isCurrentUser = session?.user?.id === member.userId

              return (
                <div
                  key={member.userId}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex-1">
                    <div className="text-[var(--text-primary)] font-medium">
                      {member.name || 'Unknown'}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-[var(--text-muted)]">(you)</span>
                      )}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">{member.email}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                      Joined {formatDate(member.joinedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {canEdit && !isCurrentUser ? (
                      <select
                        value={member.role}
                        onChange={e => handleChangeRole(member.userId, e.target.value as OrgRole)}
                        disabled={updatingMemberId === member.userId}
                        className="px-2 py-1 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-transparent text-[var(--text-primary)] cursor-pointer"
                      >
                        {ORG_ROLE_OPTIONS.map(role => (
                          <option key={role} value={role} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                            {ORG_ROLE_LABELS[role].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <OrgRoleBadge role={member.role} />
                    )}
                    {canEdit && !isCurrentUser && (
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={removingMemberId === member.userId}
                        className="text-sm text-[var(--accent-orange)] hover:opacity-80 disabled:opacity-50"
                      >
                        {removingMemberId === member.userId ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="surface-card rounded-2xl p-6">
          <h2 className="text-xl font-medium text-[var(--text-primary)] mb-4">
            Allowed Domains ({domains.length})
          </h2>

          {canEdit && (
            <form onSubmit={handleAddDomain} className="mb-6 p-4 rounded-lg bg-[var(--bg-tertiary)]">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  placeholder="example.com"
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type="submit"
                  disabled={addingDomain || !newDomain}
                  className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                >
                  {addingDomain ? 'Adding...' : 'Add Domain'}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {domains.map(domain => (
              <div
                key={domain}
                className="flex items-center justify-between py-2.5"
              >
                <code className="font-mono text-sm text-[var(--text-primary)]">{domain}</code>
                {canEdit && (
                  <button
                    onClick={() => handleRemoveDomain(domain)}
                    disabled={removingDomain === domain}
                    className="text-sm text-[var(--accent-orange)] hover:opacity-80 disabled:opacity-50"
                  >
                    {removingDomain === domain ? 'Removing...' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
