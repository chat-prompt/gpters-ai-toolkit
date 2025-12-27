'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { TeamTag } from '@/lib/types'
import { TeamTagSelector } from '@/components/TeamTagSelector'

const ITEM_TYPES = ['skill', 'agent', 'command', 'guide'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
const STATUSES = ['draft', 'published'] as const

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default function EditCatalogItem({ params }: EditPageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    id: '',
    type: 'skill' as typeof ITEM_TYPES[number],
    name: '',
    description: '',
    author: '',
    tags: '',
    teamTag: 'general' as TeamTag,
    difficulty: '' as '' | typeof DIFFICULTIES[number],
    pluginId: '',
    estimatedTime: '',
    content: '',
    readme: '',
    marketplaceEnabled: false,
    marketplaceVersion: '1.0.0',
    marketplaceSyncedAt: '',
    status: 'published' as typeof STATUSES[number],
    changelog: '',
  })

  useEffect(() => {
    async function fetchItem() {
      try {
        const password = sessionStorage.getItem('admin_password')
        const res = await fetch(`/api/catalog/${id}`, {
          headers: { 'x-admin-password': password || '' },
        })

        if (res.ok) {
          const item = await res.json()
          setFormData({
            id: item.id,
            type: item.type,
            name: item.name,
            description: item.description || '',
            author: item.author || '',
            tags: (item.tags || []).join(', '),
            teamTag: item.teamTag || 'general',
            difficulty: item.difficulty || '',
            pluginId: item.pluginId || '',
            estimatedTime: item.estimatedTime || '',
            content: item.content,
            readme: item.readme || '',
            marketplaceEnabled: item.marketplaceEnabled || false,
            marketplaceVersion: item.marketplaceVersion || '1.0.0',
            marketplaceSyncedAt: item.marketplaceSyncedAt || '',
            status: item.status || 'published',
            changelog: item.changelog || '',
          })
        } else {
          setError('Item not found')
        }
      } catch {
        setError('Failed to load item')
      } finally {
        setLoading(false)
      }
    }

    fetchItem()
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const password = sessionStorage.getItem('admin_password')
      const payload = {
        name: formData.name,
        description: formData.description,
        author: formData.author,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        teamTag: formData.teamTag,
        difficulty: formData.difficulty || null,
        pluginId: formData.pluginId || null,
        estimatedTime: formData.estimatedTime || null,
        content: formData.content,
        readme: formData.readme || null,
        type: formData.type,
        marketplaceEnabled: formData.marketplaceEnabled,
        marketplaceVersion: formData.marketplaceVersion || '1.0.0',
        status: formData.status,
        changelog: formData.changelog || null,
      }

      const res = await fetch(`/api/catalog/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password || '',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        router.push('/admin/catalog')
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
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (error && !formData.id) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="text-red-400">{error}</div>
        <Link
          href="/admin/catalog"
          className="text-[var(--accent-cyan)] hover:underline mt-4 inline-block"
        >
          Back to Catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <div className="mb-8">
        <Link
          href="/admin/catalog"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 inline-block"
        >
          ← Back to Catalog
        </Link>
        <h1 className="text-3xl font-light text-[var(--text-primary)]">
          Edit: {formData.name}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          ID: {formData.id}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass rounded-2xl p-8 space-y-6">
          {/* Type */}
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as typeof ITEM_TYPES[number] })}
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
            >
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] resize-none"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Author
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              />
            </div>
          </div>

          <TeamTagSelector
            value={formData.teamTag}
            onChange={(value) => setFormData({ ...formData, teamTag: value })}
          />

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Difficulty
              </label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as '' | typeof DIFFICULTIES[number] })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
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
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Plugin ID
              </label>
              <input
                type="text"
                value={formData.pluginId}
                onChange={(e) => setFormData({ ...formData, pluginId: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Est. Time
              </label>
              <input
                type="text"
                value={formData.estimatedTime}
                onChange={(e) => setFormData({ ...formData, estimatedTime: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              Content * (Markdown)
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] font-mono text-sm resize-none"
              rows={15}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              README (optional)
            </label>
            <textarea
              value={formData.readme}
              onChange={(e) => setFormData({ ...formData, readme: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] font-mono text-sm resize-none"
              rows={8}
            />
          </div>
        </div>

        {/* Version & Status Management */}
        <div className="glass rounded-2xl p-8 space-y-6">
          <h2 className="text-xl font-medium text-[var(--text-primary)] flex items-center gap-2">
            📦 Version & Status
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as typeof STATUSES[number] })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'draft' ? '🚧 Draft' : '✅ Published'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Draft items are visible in admin but hidden from public catalog
              </p>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Version (semver)
              </label>
              <input
                type="text"
                value={formData.marketplaceVersion}
                onChange={(e) => setFormData({ ...formData, marketplaceVersion: e.target.value })}
                placeholder="1.0.0"
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              Changelog (latest version)
            </label>
            <textarea
              value={formData.changelog}
              onChange={(e) => setFormData({ ...formData, changelog: e.target.value })}
              placeholder="What changed in this version?"
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Marketplace Settings */}
        {formData.type !== 'guide' && (
          <div className="glass rounded-2xl p-8 space-y-6">
            <h2 className="text-xl font-medium text-[var(--text-primary)] flex items-center gap-2">
              <span className="text-[var(--accent-cyan)]">CLI</span> Marketplace Settings
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Enable this item in the Claude Code plugin marketplace for CLI installation.
            </p>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.marketplaceEnabled}
                  onChange={(e) => setFormData({ ...formData, marketplaceEnabled: e.target.checked })}
                  className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--accent-cyan)] focus:ring-[var(--accent-cyan)] cursor-pointer"
                />
                <span className="text-[var(--text-primary)]">Enable in Marketplace</span>
              </label>
            </div>

            {formData.marketplaceEnabled && (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-2">
                      Last Synced
                    </label>
                    <div className="px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                      {formData.marketplaceSyncedAt
                        ? new Date(formData.marketplaceSyncedAt).toLocaleString()
                        : 'Not synced yet'}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">Installation command:</p>
                  <code className="text-sm text-[var(--accent-cyan)] font-mono">
                    /plugin install {formData.id}@company-ai-toolkit
                  </code>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-4">
          <Link
            href="/admin/catalog"
            className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
