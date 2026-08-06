/**
 * Admin MCP servers management page
 *
 * CRUD interface for managing MCP server metadata with
 * documentation URL and description editing.
 */
'use client'

import { useState, useEffect } from 'react'
import { Link } from '@/i18n/navigation'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'

interface McpServer {
  id: string
  label: string
  description: string
  documentationUrl: string | null
  createdAt: string
  updatedAt: string
}

/** 폼 입력 공통 클래스 */
const inputClass =
  'w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)] transition-colors'

/** 폼 라벨 공통 클래스 */
const labelClass = 'block text-sm text-[var(--text-muted)] mb-2'

export default function McpServersAdminPage() {
  useAdminAuth() // For layout protection
  const { confirm } = useConfirmDialog()
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [formData, setFormData] = useState({
    id: '',
    label: '',
    description: '',
    documentationUrl: '',
  })

  const fetchServers = async () => {
    try {
      const res = await fetch('/api/mcp-servers')
      const data = await res.json()
      setServers(data)
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchServers()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingServer) {
        await fetch(`/api/mcp-servers/${editingServer.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: formData.label,
            description: formData.description,
            documentationUrl: formData.documentationUrl || null,
          }),
        })
      } else {
        await fetch('/api/mcp-servers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        })
      }

      setShowForm(false)
      setEditingServer(null)
      setFormData({ id: '', label: '', description: '', documentationUrl: '' })
      fetchServers()
    } catch (error) {
      console.error('Failed to save MCP server:', error)
    }
  }

  const handleEdit = (server: McpServer) => {
    setEditingServer(server)
    setFormData({
      id: server.id,
      label: server.label,
      description: server.description,
      documentationUrl: server.documentationUrl || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'MCP 서버 삭제',
      description: '이 MCP 서버를 정말 삭제하시겠습니까?',
      variant: 'danger',
      confirmLabel: '삭제',
    })
    if (!confirmed) return

    try {
      await fetch(`/api/mcp-servers/${id}`, {
        method: 'DELETE',
      })
      fetchServers()
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="page-title">MCP Servers</h1>
          <p className="page-subtitle">Manage MCP server definitions</p>
        </div>
        <button
          onClick={() => {
            setEditingServer(null)
            setFormData({ id: '', label: '', description: '', documentationUrl: '' })
            setShowForm(true)
          }}
          className="px-4 py-2 rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-90"
        >
          + Add MCP Server
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="surface-card rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-medium text-[var(--text-primary)] mb-6">
              {editingServer ? 'Edit MCP Server' : 'New MCP Server'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingServer && (
                <div>
                  <label className={labelClass}>ID (slug)</label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g., github, slack"
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
                  placeholder="e.g., GitHub MCP"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`${inputClass} h-20`}
                  placeholder="What does this MCP server do?"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Documentation URL (optional)</label>
                <input
                  type="url"
                  value={formData.documentationUrl}
                  onChange={(e) => setFormData({ ...formData, documentationUrl: e.target.value })}
                  placeholder="https://..."
                  className={inputClass}
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
                  {editingServer ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Servers List */}
      {loading ? (
        <div className="text-[var(--text-muted)]">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="eyebrow text-left px-3 py-2 font-normal">ID</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Label</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Description</th>
                <th className="eyebrow text-left px-3 py-2 font-normal">Docs</th>
                <th className="eyebrow text-right px-3 py-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {servers.map((server) => (
                <tr key={server.id}>
                  <td className="px-3 py-2.5 text-[var(--text-primary)] font-mono text-xs">{server.id}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{server.label}</td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-xs truncate">
                    {server.description || '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    {server.documentationUrl ? (
                      <a
                        href={server.documentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleEdit(server)}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="text-[var(--accent-orange)] hover:opacity-80"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    No MCP servers found. Create your first MCP server!
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
