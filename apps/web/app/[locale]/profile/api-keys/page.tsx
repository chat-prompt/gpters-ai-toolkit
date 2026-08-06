/**
 * API Key Management Page
 *
 * 사용자가 자신의 API Key를 생성, 조회, 폐기할 수 있는 관리 페이지입니다.
 * 헤드리스/서버 환경에서 `aitk login --token <key>`로 사용합니다.
 */
'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { CopyButton } from '@/components/ui/CopyButton'
import { useToast } from '@/components/ui/Toast'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Link } from '@/i18n/navigation'

/** API Key 데이터 */
interface ApiKey {
  id: string
  name: string | null
  scope: string | null
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  usageCount: number
  createdAt: string | null
}

/** 새로 생성된 키 (raw token 포함) */
interface NewKeyResult {
  id: string
  name: string
  token: string
  expiresAt: string
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '-'
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateString)
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null)
  const { success, error: showError } = useToast()
  const { confirm } = useConfirmDialog()
  const t = useTranslations('profile')

  async function fetchKeys() {
    try {
      const res = await fetch('/api/api-keys')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setKeys(data.keys || [])
    } catch {
      showError('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
  }, [])

  async function handleCreate() {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create key')
      }
      const data = await res.json()
      setNewKey(data.key)
      setNewKeyName('')
      setShowCreateForm(false)
      success(t('apiKeys.createSuccess'))
      fetchKeys()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string, name: string | null) {
    const confirmed = await confirm({
      title: t('apiKeys.revokeConfirmTitle'),
      description: t('apiKeys.revokeConfirmDescription'),
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      const res = await fetch('/api/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to revoke')
      success(`Key "${name || id}" revoked`)
      fetchKeys()
    } catch {
      showError('Failed to revoke key')
    }
  }

  const activeKeys = keys.filter((k) => k.isActive)
  const revokedKeys = keys.filter((k) => !k.isActive)

  return (
    <div className="page-shell">
      <main className="page-main">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Link
              href="/profile"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              ← Profile
            </Link>
            <h1 className="page-title mt-2">{t('apiKeys.title')}</h1>
            <p className="page-subtitle">{t('apiKeys.description')}</p>
          </div>
          {!showCreateForm && !newKey && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 rounded-lg border border-[var(--border-hover)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              {t('apiKeys.createNew')}
            </button>
          )}
        </div>

        {/* New key display (shown once after creation) */}
        {newKey && (
          <div className="surface-card mb-8 border-[var(--border-hover)]">
            <div className="mb-4">
              <h3 className="font-semibold text-[var(--text-primary)]">{newKey.name}</h3>
              <p className="text-[var(--text-secondary)] text-sm mt-1">{t('apiKeys.copyWarning')}</p>
            </div>
            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-lg p-3">
              <code className="flex-1 text-sm font-mono text-[var(--text-primary)] break-all select-all">
                {newKey.token}
              </code>
              <CopyButton text={newKey.token} />
            </div>
            <div className="mt-3 text-xs text-[var(--text-muted)] font-mono">
              aitk login --token {newKey.token.slice(0, 12)}...
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="mt-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div className="surface-card mb-8">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4">{t('apiKeys.createNew')}</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newKeyName.trim()) handleCreate()
                  if (e.key === 'Escape') setShowCreateForm(false)
                }}
                placeholder={t('apiKeys.namePlaceholder')}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-hover)] text-sm"
                maxLength={100}
                autoFocus
                disabled={creating}
              />
              <button
                onClick={handleCreate}
                disabled={!newKeyName.trim() || creating}
                className="px-4 py-2 rounded-lg border border-[var(--border-hover)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? '...' : t('apiKeys.generate')}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setNewKeyName('')
                }}
                className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Key list */}
        {loading ? (
          <div className="surface-card text-center py-12">
            <p className="text-sm text-[var(--text-muted)]">Loading...</p>
          </div>
        ) : keys.length === 0 ? (
          <div className="surface-card text-center py-12">
            <p className="text-sm text-[var(--text-secondary)]">{t('apiKeys.noKeys')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left py-3 px-2 eyebrow font-normal">Name</th>
                  <th className="text-left py-3 px-2 eyebrow font-normal">Created</th>
                  <th className="text-left py-3 px-2 eyebrow font-normal">Last Used</th>
                  <th className="text-left py-3 px-2 eyebrow font-normal">Status</th>
                  <th className="text-right py-3 px-2 eyebrow font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {activeKeys.map((key) => (
                  <tr key={key.id} className="transition-colors duration-200 hover:bg-[var(--bg-tertiary)]/40">
                    <td className="px-2 py-4">
                      <span className="font-medium text-[var(--text-primary)]">{key.name || 'Unnamed'}</span>
                      {key.usageCount > 0 && (
                        <span className="ml-2 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                          {key.usageCount} uses
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-4 text-[var(--text-secondary)]">{formatDate(key.createdAt)}</td>
                    <td className="px-2 py-4 text-[var(--text-secondary)]">{formatRelativeTime(key.lastUsedAt)}</td>
                    <td className="px-2 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)]" />
                        {t('apiKeys.status.active')}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right">
                      <button
                        onClick={() => handleRevoke(key.id, key.name)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-4 transition-colors"
                      >
                        {t('apiKeys.revoke')}
                      </button>
                    </td>
                  </tr>
                ))}
                {revokedKeys.map((key) => (
                  <tr key={key.id} className="opacity-50">
                    <td className="px-2 py-4">
                      <span className="text-[var(--text-secondary)] line-through">{key.name || 'Unnamed'}</span>
                    </td>
                    <td className="px-2 py-4 text-[var(--text-muted)]">{formatDate(key.createdAt)}</td>
                    <td className="px-2 py-4 text-[var(--text-muted)]">{formatRelativeTime(key.lastUsedAt)}</td>
                    <td className="px-2 py-4 text-[var(--text-muted)]">{t('apiKeys.status.revoked')}</td>
                    <td className="px-2 py-4" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
