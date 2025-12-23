'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CatalogItem {
  id: string
  type: string
  name: string
  description: string
  author: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

const TYPE_COLORS: Record<string, string> = {
  skill: 'text-cyan-400',
  agent: 'text-purple-400',
  prompt: 'text-orange-400',
  command: 'text-rose-400',
  guide: 'text-emerald-400',
}

const TYPE_ICONS: Record<string, string> = {
  skill: '⚡',
  agent: '◈',
  prompt: '✦',
  command: '▸',
  guide: '📚',
}

export default function CatalogList() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function fetchItems() {
    try {
      const password = sessionStorage.getItem('admin_password')
      const url = filter === 'all' ? '/api/catalog' : `/api/catalog?type=${filter}`
      const res = await fetch(url, {
        headers: { 'x-admin-password': password || '' },
      })
      const data = await res.json()
      setItems(data)
    } catch (error) {
      console.error('Failed to fetch items:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [filter])

  async function handleDelete(id: string) {
    if (!confirm(`Are you sure you want to delete "${id}"?`)) return

    try {
      const password = sessionStorage.getItem('admin_password')
      const res = await fetch(`/api/catalog/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password || '' },
      })

      if (res.ok) {
        setItems(items.filter((item) => item.id !== id))
        setDeleteId(null)
      } else {
        alert('Failed to delete item')
      }
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete item')
    }
  }

  const filters = ['all', 'skill', 'agent', 'prompt', 'command', 'guide']

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
            Catalog
          </h1>
          <p className="text-[var(--text-secondary)]">
            {items.length} items
          </p>
        </div>
        <Link
          href="/admin/catalog/new"
          className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
        >
          Create New
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filter === f
                ? 'bg-[var(--accent-cyan)] text-black'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--text-muted)] mb-4">No items found</p>
          <Link
            href="/admin/catalog/new"
            className="text-[var(--accent-cyan)] hover:underline"
          >
            Create your first item
          </Link>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Type
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  ID
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Name
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Author
                </th>
                <th className="text-right px-6 py-4 text-sm font-medium text-[var(--text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className={`${TYPE_COLORS[item.type]} flex items-center gap-2`}>
                      <span>{TYPE_ICONS[item.type]}</span>
                      <span className="text-xs uppercase tracking-wider">
                        {item.type}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-[var(--text-secondary)]">
                      {item.id}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[var(--text-primary)]">{item.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--text-muted)]">
                      @{item.author}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/${item.type === 'guide' ? 'guides' : item.type}/${item.id}`}
                        className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        target="_blank"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/catalog/${item.id}/edit`}
                        className="px-3 py-1.5 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        Delete
                      </button>
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
