/**
 * Admin tags management page
 *
 * CRUD interface for managing catalog item tags with
 * color customization and description editing.
 */
'use client'

import { useState, useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Tag {
  id: string
  label: string
  color: string
  description: string | null
  createdAt: string
  updatedAt: string
}

/** 폼 입력 공통 클래스 */
const inputClass =
  'w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-colors'

/** 폼 라벨 공통 클래스 */
const labelClass = 'block text-sm text-[var(--text-muted)] mb-2'

export default function TagsAdminPage() {
  useAdminAuth() // For layout protection
  const { confirm } = useConfirmDialog()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [formData, setFormData] = useState({
    id: '',
    label: '',
    color: 'bg-gray-100 text-gray-800',
    description: '',
  })

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags')
      const data = await res.json()
      setTags(data)
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTags()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingTag) {
        await fetch(`/api/tags/${editingTag.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: formData.label,
            color: formData.color,
            description: formData.description || null,
          }),
        })
      } else {
        await fetch('/api/tags', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        })
      }

      setShowForm(false)
      setEditingTag(null)
      setFormData({ id: '', label: '', color: 'bg-gray-100 text-gray-800', description: '' })
      fetchTags()
    } catch (error) {
      console.error('Failed to save tag:', error)
    }
  }

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag)
    setFormData({
      id: tag.id,
      label: tag.label,
      color: tag.color,
      description: tag.description || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '태그 삭제',
      description: '이 태그를 정말 삭제하시겠습니까?',
      variant: 'danger',
      confirmLabel: '삭제',
    })
    if (!confirmed) return

    try {
      await fetch(`/api/tags/${id}`, {
        method: 'DELETE',
      })
      fetchTags()
    } catch (error) {
      console.error('Failed to delete tag:', error)
    }
  }

  const colorOptions = [
    { value: 'bg-gray-100 text-gray-800', label: 'Gray' },
    { value: 'bg-blue-100 text-blue-800', label: 'Blue' },
    { value: 'bg-green-100 text-green-800', label: 'Green' },
    { value: 'bg-yellow-100 text-yellow-800', label: 'Yellow' },
    { value: 'bg-red-100 text-red-800', label: 'Red' },
    { value: 'bg-purple-100 text-purple-800', label: 'Purple' },
    { value: 'bg-pink-100 text-pink-800', label: 'Pink' },
    { value: 'bg-indigo-100 text-indigo-800', label: 'Indigo' },
    { value: 'bg-cyan-100 text-cyan-800', label: 'Cyan' },
    { value: 'bg-orange-100 text-orange-800', label: 'Orange' },
    { value: 'bg-teal-100 text-teal-800', label: 'Teal' },
    { value: 'bg-emerald-100 text-emerald-800', label: 'Emerald' },
  ]

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="page-title">Tags</h1>
          <p className="page-subtitle">Manage catalog item tags</p>
        </div>
        <button
          onClick={() => {
            setEditingTag(null)
            setFormData({ id: '', label: '', color: 'bg-gray-100 text-gray-800', description: '' })
            setShowForm(true)
          }}
          className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90"
        >
          + Add Tag
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="surface-card rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-medium text-[var(--text-primary)] mb-6">
              {editingTag ? 'Edit Tag' : 'New Tag'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingTag && (
                <div>
                  <label className={labelClass}>ID (slug)</label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g., my-tag"
                    className={inputClass}
                    required
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Label</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Display name"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Color</label>
                <select
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className={inputClass}
                >
                  {colorOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="mt-2">
                  <span className={`inline-block px-2 py-1 rounded text-xs ${formData.color}`}>
                    Preview
                  </span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Description (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`${inputClass} h-20`}
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
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] font-medium"
                >
                  {editingTag ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tags List */}
      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="eyebrow text-left px-3 py-2 font-normal">ID</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Label</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Preview</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Description</th>
                <th className="eyebrow text-right px-3 py-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td className="px-3 py-2.5 text-[var(--text-primary)] font-mono text-xs">{tag.id}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{tag.label}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-1 rounded text-xs ${tag.color}`}>
                      {tag.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                    {tag.description || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleEdit(tag)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="text-[var(--accent-orange)] hover:opacity-80"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {tags.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    No tags found. Create your first tag!
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
