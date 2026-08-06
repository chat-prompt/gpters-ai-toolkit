/**
 * Edit catalog item page
 *
 * Form for editing existing catalog items with security audit,
 * version management, and status controls.
 * Requires a non-empty changelog entry when the content field is modified
 * (dirty-detection gate) before the form can be submitted.
 */
'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { Link } from '@/i18n/navigation'
import { useSession } from 'next-auth/react'
import { SecurityAuditPanel, SecurityAuditBadge } from '@/components/admin/SecurityAuditPanel'
import type { SecurityAuditResult } from '@/lib/security/security-audit'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'
import { useOrgContext } from '@/lib/hooks/useOrgContext'

const ITEM_TYPES = ['skill', 'agent', 'command', 'guide'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
const STATUSES = ['draft', 'published'] as const

/** 폼 입력 공통 클래스 */
const inputClass =
  'w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-colors'

/** 폼 라벨 공통 클래스 */
const labelClass = 'block text-sm text-[var(--text-secondary)] mb-2'

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default function EditCatalogItem({ params }: EditPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl')
  useAdminAuth() // For layout protection
  const { data: session } = useSession()
  const { currentOrgId } = useOrgContext()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [securityAuditResult, setSecurityAuditResult] = useState<SecurityAuditResult | null>(null)
  const [showSecurityPanel, setShowSecurityPanel] = useState(false)
  const [orgs, setOrgs] = useState<{id: string, name: string}[]>([])
  /** The content value loaded from the server, used to detect dirty state. */
  const [initialContent, setInitialContent] = useState('')

  const [formData, setFormData] = useState({
    id: '',
    type: 'skill' as typeof ITEM_TYPES[number],
    name: '',
    description: '',
    authorName: '',
    tags: '',
    difficulty: '' as '' | typeof DIFFICULTIES[number],
    pluginId: '',
    estimatedTime: '',
    content: '',
    readme: '',
    mcpEnabled: false,
    version: '1.0.0',
    status: 'published' as typeof STATUSES[number],
    changelog: '',
    orgId: '',
    visibility: 'private' as 'private' | 'public',
  })

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/catalog/${id}`)

      if (res.ok) {
        const item = await res.json()
        setFormData({
          id: item.id,
          type: item.type,
          name: item.name,
          description: item.description || '',
          authorName: item.authorName || '',
          tags: (item.tags || []).join(', '),
          difficulty: item.difficulty || '',
          pluginId: item.pluginId || '',
          estimatedTime: item.estimatedTime || '',
          content: item.content,
          readme: item.readme || '',
          mcpEnabled: item.mcpEnabled || false,
          version: item.version || '1.0.0',
          status: item.status || 'published',
          changelog: item.changelog || '',
          orgId: item.orgId || '',
          visibility: item.visibility || 'private',
        })
        setInitialContent(item.content)
      } else {
        setError('Item not found')
      }
    } catch {
      setError('Failed to load item')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchItem()
  }, [fetchItem])

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const res = await fetch('/api/organizations')
        if (res.ok) {
          const data = await res.json()
          setOrgs(data.organizations || [])
        }
      } catch (error) {
        console.error('Failed to fetch organizations:', error)
      }
    }
    fetchOrgs()
  }, [])

  /** True when the content textarea value differs from the server-loaded value. */
  const isContentDirty = formData.content !== initialContent
  /**
   * Disables the submit button when content is dirty but the changelog field
   * is still empty. The server also enforces this constraint (Task 4), so this
   * is a UX-layer guard only.
   */
  const isSubmitDisabled = saving || (isContentDirty && formData.changelog.trim().length === 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        difficulty: formData.difficulty || null,
        pluginId: formData.pluginId || null,
        estimatedTime: formData.estimatedTime || null,
        content: formData.content,
        readme: formData.readme || null,
        type: formData.type,
        mcpEnabled: formData.mcpEnabled,
        version: formData.version || '1.0.0',
        status: formData.status,
        changelog: formData.changelog || null,
        visibility: formData.visibility,
      }

      const res = await fetch(`/api/catalog/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        // Reset dirty tracking so a follow-up edit (without leaving the page)
        // starts from a clean baseline and the changelog gate re-arms.
        setInitialContent(formData.content)
        setFormData((prev) => ({ ...prev, changelog: '' }))
        // Redirect to returnUrl if provided, otherwise go to admin catalog
        router.push(returnUrl || '/admin/catalog')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to update item')
      }
    } catch {
      setError('Connection error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (error && !formData.id) {
    return (
      <div className="max-w-4xl">
        <div className="text-[var(--accent-orange)]">{error}</div>
        <Link
          href="/admin/catalog"
          className="text-[var(--text-primary)] hover:underline mt-4 inline-block"
        >
          Back to Catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link
          href={returnUrl || '/admin/catalog'}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 inline-block"
        >
          ← {returnUrl ? '돌아가기' : 'Back to Catalog'}
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="page-title">Edit: {formData.name}</h1>
          <SecurityAuditBadge
            result={securityAuditResult}
            onClick={() => setShowSecurityPanel(!showSecurityPanel)}
          />
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          ID: {formData.id}
        </p>
      </div>

      {/* Security Audit Panel */}
      {showSecurityPanel && (
        <SecurityAuditPanel
          itemId={formData.id}
          content={formData.content}
          onAuditComplete={setSecurityAuditResult}
          autoRun={true}
          className="mb-6"
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="surface-card rounded-2xl p-6 space-y-6">
          {/* Type */}
          <div>
            <label className={labelClass}>Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as typeof ITEM_TYPES[number] })}
              className={inputClass}
            >
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`${inputClass} resize-none`}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Author (read-only)</label>
              <div className="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                @{formData.authorName || 'Unknown'}
              </div>
            </div>
            <div>
              <label className={labelClass}>Tags (comma-separated)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Organization</label>
            {session?.user?.role === 'super_admin' ? (
              <select
                value={formData.orgId}
                onChange={(e) => setFormData({ ...formData, orgId: e.target.value })}
                className={inputClass}
              >
                <option value="">Select organization...</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                {orgs.find((o) => o.id === currentOrgId)?.name || 'Your organization'}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Visibility</label>
            <div className="flex gap-2">
              {(['private', 'public'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFormData({ ...formData, visibility: v })}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors capitalize ${
                    formData.visibility === v
                      ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              {formData.visibility === 'private'
                ? 'Only visible to your organization members'
                : 'Visible to all authenticated users'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className={labelClass}>Difficulty</label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as '' | typeof DIFFICULTIES[number] })}
                className={inputClass}
              >
                <option value="">None</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Plugin ID</label>
              <input
                type="text"
                value={formData.pluginId}
                onChange={(e) => setFormData({ ...formData, pluginId: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Est. Time</label>
              <input
                type="text"
                value={formData.estimatedTime}
                onChange={(e) => setFormData({ ...formData, estimatedTime: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Content * (Markdown)</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className={`${inputClass} font-mono text-sm resize-none`}
              rows={15}
              required
            />
          </div>

          <div>
            <label className={labelClass}>README (optional)</label>
            <textarea
              value={formData.readme}
              onChange={(e) => setFormData({ ...formData, readme: e.target.value })}
              className={`${inputClass} font-mono text-sm resize-none`}
              rows={8}
            />
          </div>
        </div>

        {/* Version & Status Management */}
        <div className="surface-card rounded-2xl p-6 space-y-6">
          <h2 className="text-xl font-medium text-[var(--text-primary)]">
            Version & Status
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as typeof STATUSES[number] })}
                className={inputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'draft' ? 'Draft' : 'Published'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Draft items are visible in admin but hidden from public catalog
              </p>
            </div>
            <div>
              <label className={labelClass}>Version (semver)</label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="1.0.0"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="changelog" className={labelClass}>
              변경 사유 (changelog)
              {isContentDirty && (
                <span className="text-[var(--accent-orange)] ml-1">*</span>
              )}
            </label>
            <textarea
              id="changelog"
              value={formData.changelog}
              onChange={(e) => setFormData({ ...formData, changelog: e.target.value })}
              placeholder="이번 변경의 핵심을 한 줄 이상 적어주세요"
              className={`${inputClass} resize-none`}
              rows={3}
              required={isContentDirty}
            />
            {isContentDirty && formData.changelog.trim().length === 0 && (
              <p className="mt-1 text-xs text-[var(--accent-orange)]">
                콘텐츠가 변경되어 changelog 입력이 필수입니다.
              </p>
            )}
          </div>
        </div>

        {/* CLI Settings */}
        {formData.type !== 'guide' && (
          <div className="surface-card rounded-2xl p-6 space-y-6">
            <h2 className="text-xl font-medium text-[var(--text-primary)]">
              CLI Settings
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Enable this item for CLI plugin installation.
            </p>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.mcpEnabled}
                  onChange={(e) => setFormData({ ...formData, mcpEnabled: e.target.checked })}
                  className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-[var(--border-hover)] cursor-pointer"
                />
                <span className="text-[var(--text-primary)]">Enable for CLI</span>
              </label>
            </div>

          </div>
        )}

        {error && (
          <div className="text-[var(--accent-orange)] text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-4">
          <Link
            href={returnUrl || '/admin/catalog'}
            className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            {returnUrl ? '취소' : 'Cancel'}
          </Link>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="px-6 py-3 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
