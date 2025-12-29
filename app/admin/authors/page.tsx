'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'

interface Author {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  bio: string | null
  createdAt: string
  updatedAt: string
}

export default function AuthorsAdminPage() {
  const { password } = useAdminAuth()
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAuthor, setEditingAuthor] = useState<Author | null>(null)
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    email: '',
    avatarUrl: '',
    bio: '',
  })

  const fetchAuthors = async () => {
    try {
      const res = await fetch('/api/authors')
      const data = await res.json()
      setAuthors(data)
    } catch (error) {
      console.error('Failed to fetch authors:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuthors()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingAuthor) {
        await fetch(`/api/authors/${editingAuthor.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': password || '',
          },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email || null,
            avatarUrl: formData.avatarUrl || null,
            bio: formData.bio || null,
          }),
        })
      } else {
        await fetch('/api/authors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': password || '',
          },
          body: JSON.stringify(formData),
        })
      }

      setShowForm(false)
      setEditingAuthor(null)
      setFormData({ id: '', name: '', email: '', avatarUrl: '', bio: '' })
      fetchAuthors()
    } catch (error) {
      console.error('Failed to save author:', error)
    }
  }

  const handleEdit = (author: Author) => {
    setEditingAuthor(author)
    setFormData({
      id: author.id,
      name: author.name,
      email: author.email || '',
      avatarUrl: author.avatarUrl || '',
      bio: author.bio || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      await fetch(`/api/authors/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password || '' },
      })
      fetchAuthors()
    } catch (error) {
      console.error('Failed to delete author:', error)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">Authors</h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage catalog item authors</p>
        </div>
        <button
          onClick={() => {
            setEditingAuthor(null)
            setFormData({ id: '', name: '', email: '', avatarUrl: '', bio: '' })
            setShowForm(true)
          }}
          className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90"
        >
          + Add Author
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass rounded-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-xl font-medium text-[var(--text-primary)] mb-6">
              {editingAuthor ? 'Edit Author' : 'New Author'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingAuthor && (
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">ID (slug)</label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g., john-doe"
                    className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Email (optional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Avatar URL (optional)</label>
                <input
                  type="url"
                  value={formData.avatarUrl}
                  onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Bio (optional)</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] h-20"
                  placeholder="Short bio..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium"
                >
                  {editingAuthor ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authors List */}
      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">ID</th>
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">Name</th>
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">Email</th>
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">Bio</th>
                <th className="text-right px-6 py-4 text-sm text-[var(--text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {authors.map((author) => (
                <tr key={author.id} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="px-6 py-4 text-[var(--text-primary)] font-mono text-sm">{author.id}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {author.avatarUrl && (
                        <Image src={author.avatarUrl} alt="" width={32} height={32} className="w-8 h-8 rounded-full" unoptimized />
                      )}
                      <span className="text-[var(--text-primary)]">{author.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[var(--text-secondary)] text-sm">
                    {author.email || '-'}
                  </td>
                  <td className="px-6 py-4 text-[var(--text-secondary)] text-sm max-w-xs truncate">
                    {author.bio || '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEdit(author)}
                      className="text-[var(--accent-cyan)] hover:underline text-sm mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(author.id)}
                      className="text-red-400 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {authors.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-muted)]">
                    No authors found. Create your first author!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
