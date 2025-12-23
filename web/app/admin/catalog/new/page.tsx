'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ITEM_TYPES = ['skill', 'agent', 'prompt', 'command', 'guide'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export default function NewCatalogItem() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    id: '',
    type: 'skill' as typeof ITEM_TYPES[number],
    name: '',
    description: '',
    author: '',
    tags: '',
    difficulty: '' as '' | typeof DIFFICULTIES[number],
    pluginId: '',
    estimatedTime: '',
    content: '',
    readme: '',
    marketplaceEnabled: false,
    marketplaceVersion: '1.0.0',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const password = sessionStorage.getItem('admin_password')
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        difficulty: formData.difficulty || null,
        pluginId: formData.pluginId || null,
        estimatedTime: formData.estimatedTime || null,
        readme: formData.readme || null,
        marketplaceEnabled: formData.marketplaceEnabled,
        marketplaceVersion: formData.marketplaceVersion || '1.0.0',
      }

      const res = await fetch('/api/catalog', {
        method: 'POST',
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
        setError(data.error || 'Failed to create item')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
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
          Create New Item
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass rounded-2xl p-8 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                ID *
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
                placeholder="my-skill-id"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Type *
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
              placeholder="My Awesome Skill"
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
              placeholder="A brief description of what this item does..."
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
                placeholder="username"
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
                placeholder="code, productivity, writing"
              />
            </div>
          </div>

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
                Plugin ID (skills only)
              </label>
              <input
                type="text"
                value={formData.pluginId}
                onChange={(e) => setFormData({ ...formData, pluginId: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
                placeholder="@author/plugin-name"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">
                Est. Time (guides only)
              </label>
              <input
                type="text"
                value={formData.estimatedTime}
                onChange={(e) => setFormData({ ...formData, estimatedTime: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
                placeholder="10분"
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
              placeholder="# My Skill&#10;&#10;Your skill content here..."
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">
              README (optional, Markdown)
            </label>
            <textarea
              value={formData.readme}
              onChange={(e) => setFormData({ ...formData, readme: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] font-mono text-sm resize-none"
              rows={8}
              placeholder="Additional documentation..."
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
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">
                  Version (semver)
                </label>
                <input
                  type="text"
                  value={formData.marketplaceVersion}
                  onChange={(e) => setFormData({ ...formData, marketplaceVersion: e.target.value })}
                  placeholder="1.0.0"
                  className="w-full max-w-xs px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
                />
              </div>
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
            disabled={loading}
            className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Item'}
          </button>
        </div>
      </form>
    </div>
  )
}
