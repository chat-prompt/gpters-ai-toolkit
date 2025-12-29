'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'

interface McpServer {
  id: string
  label: string
  description: string
  documentationUrl: string | null
  createdAt: string
  updatedAt: string
}

export default function McpServersAdminPage() {
  const { password } = useAdminAuth()
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
            'x-admin-password': password || '',
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
            'x-admin-password': password || '',
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
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      await fetch(`/api/mcp-servers/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password || '' },
      })
      fetchServers()
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">MCP Servers</h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage MCP server definitions</p>
        </div>
        <button
          onClick={() => {
            setEditingServer(null)
            setFormData({ id: '', label: '', description: '', documentationUrl: '' })
            setShowForm(true)
          }}
          className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90"
        >
          + Add MCP Server
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass rounded-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-xl font-medium text-[var(--text-primary)] mb-6">
              {editingServer ? 'Edit MCP Server' : 'New MCP Server'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingServer && (
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">ID (slug)</label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g., github, slack"
                    className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Label</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g., GitHub MCP"
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] h-20"
                  placeholder="What does this MCP server do?"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Documentation URL (optional)</label>
                <input
                  type="url"
                  value={formData.documentationUrl}
                  onChange={(e) => setFormData({ ...formData, documentationUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
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
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">ID</th>
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">Label</th>
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">Description</th>
                <th className="text-left px-6 py-4 text-sm text-[var(--text-muted)]">Docs</th>
                <th className="text-right px-6 py-4 text-sm text-[var(--text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => (
                <tr key={server.id} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="px-6 py-4 text-[var(--text-primary)] font-mono text-sm">{server.id}</td>
                  <td className="px-6 py-4 text-[var(--text-primary)]">{server.label}</td>
                  <td className="px-6 py-4 text-[var(--text-secondary)] text-sm max-w-xs truncate">
                    {server.description || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {server.documentationUrl ? (
                      <a
                        href={server.documentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-cyan)] hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEdit(server)}
                      className="text-[var(--accent-cyan)] hover:underline text-sm mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="text-red-400 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-muted)]">
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
