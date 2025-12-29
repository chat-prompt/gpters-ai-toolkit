'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import MCPTokenGenerator from '@/components/features/mcp/MCPTokenGenerator'
import type { UserRole } from '@/lib/security/rbac'

interface McpToken {
  id: string
  name: string
  description: string | null
  createdBy: string | null
  expiresAt: string | null
  lastUsedAt: string | null
  usageCount: number
  rateLimit: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function McpTokensPage() {
  const { data: session } = useSession()
  const [tokens, setTokens] = useState<McpToken[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showGenerator, setShowGenerator] = useState(false)

  const currentUserRole = session?.user?.role as UserRole | undefined
  const canManageTokens = currentUserRole === 'admin'

  const fetchTokens = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/admin/mcp-tokens')
      if (!res.ok) {
        if (res.status === 403) {
          setError('You do not have permission to manage MCP tokens')
          return
        }
        throw new Error('Failed to fetch tokens')
      }
      const data = await res.json()
      setTokens(data.tokens)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  async function handleRevoke(id: string) {
    if (!confirm('Are you sure you want to revoke this token? It can be reactivated later.')) {
      return
    }

    setActionLoading(id)
    try {
      const res = await fetch(`/api/admin/mcp-tokens?id=${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to revoke token')
      }

      await fetchTokens()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke token')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReactivate(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reactivate' }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to reactivate token')
      }

      await fetchTokens()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate token')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to PERMANENTLY delete this token? This action cannot be undone.')) {
      return
    }

    setActionLoading(id)
    try {
      const res = await fetch(`/api/admin/mcp-tokens?id=${id}&permanent=true`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to delete token')
      }

      await fetchTokens()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete token')
    } finally {
      setActionLoading(null)
    }
  }

  function handleTokenCreated() {
    setShowGenerator(false)
    fetchTokens()
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatRelativeDate(dateString: string | null): string {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'Expired'
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays <= 7) return `${diffDays} days`
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks`
    return `${Math.ceil(diffDays / 30)} months`
  }

  function isExpired(dateString: string | null): boolean {
    if (!dateString) return false
    return new Date(dateString) < new Date()
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="text-[var(--text-muted)]">Loading tokens...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  const activeTokens = tokens.filter(t => t.isActive && !isExpired(t.expiresAt))
  const inactiveTokens = tokens.filter(t => !t.isActive || isExpired(t.expiresAt))

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
            MCP API Tokens
          </h1>
          <p className="text-[var(--text-secondary)]">
            Manage API tokens for MCP endpoint authentication
            {!canManageTokens && (
              <span className="ml-2 text-yellow-400">
                (View only - Admin role required to manage tokens)
              </span>
            )}
          </p>
        </div>
        {canManageTokens && (
          <button
            onClick={() => setShowGenerator(true)}
            className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            Generate Token
          </button>
        )}
      </div>

      {/* Token Generator Modal */}
      {showGenerator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-medium text-[var(--text-primary)]">
                Generate New Token
              </h2>
              <button
                onClick={() => setShowGenerator(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <MCPTokenGenerator onSuccess={handleTokenCreated} onCancel={() => setShowGenerator(false)} />
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass rounded-xl p-4">
          <div className="text-2xl font-light text-[var(--text-primary)]">{tokens.length}</div>
          <div className="text-sm text-[var(--text-muted)]">Total Tokens</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-2xl font-light text-green-400">{activeTokens.length}</div>
          <div className="text-sm text-[var(--text-muted)]">Active</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-2xl font-light text-yellow-400">{inactiveTokens.length}</div>
          <div className="text-sm text-[var(--text-muted)]">Inactive/Expired</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-2xl font-light text-[var(--accent-cyan)]">
            {tokens.reduce((sum, t) => sum + t.usageCount, 0).toLocaleString()}
          </div>
          <div className="text-sm text-[var(--text-muted)]">Total API Calls</div>
        </div>
      </div>

      {/* Active Tokens */}
      {activeTokens.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">Active Tokens</h2>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Name</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Usage</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Rate Limit</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Expires</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Last Used</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeTokens.map((token) => (
                  <tr
                    key={token.id}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-[var(--text-primary)] font-medium">{token.name}</div>
                      {token.description && (
                        <div className="text-sm text-[var(--text-muted)] truncate max-w-xs">
                          {token.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--accent-cyan)]">{token.usageCount.toLocaleString()}</span>
                      <span className="text-[var(--text-muted)]"> calls</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--text-secondary)]">{token.rateLimit ?? 100}/min</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--text-secondary)]">
                        {token.expiresAt ? formatRelativeDate(token.expiresAt) : 'Never'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[var(--text-muted)]">
                        {formatDate(token.lastUsedAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {canManageTokens && (
                        <button
                          onClick={() => handleRevoke(token.id)}
                          disabled={actionLoading === token.id}
                          className="text-sm text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                        >
                          {actionLoading === token.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inactive/Expired Tokens */}
      {inactiveTokens.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">Inactive/Expired Tokens</h2>
          <div className="glass rounded-2xl overflow-hidden opacity-75">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Name</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Usage</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Last Used</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-[var(--text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inactiveTokens.map((token) => (
                  <tr
                    key={token.id}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-[var(--text-secondary)]">{token.name}</div>
                      {token.description && (
                        <div className="text-sm text-[var(--text-muted)] truncate max-w-xs">
                          {token.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!token.isActive ? (
                        <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          Revoked
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                          Expired
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--text-muted)]">{token.usageCount.toLocaleString()} calls</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[var(--text-muted)]">
                        {formatDate(token.lastUsedAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {canManageTokens && (
                        <div className="flex items-center gap-3">
                          {!token.isActive && !isExpired(token.expiresAt) && (
                            <button
                              onClick={() => handleReactivate(token.id)}
                              disabled={actionLoading === token.id}
                              className="text-sm text-green-400 hover:text-green-300 disabled:opacity-50"
                            >
                              {actionLoading === token.id ? 'Reactivating...' : 'Reactivate'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(token.id)}
                            disabled={actionLoading === token.id}
                            className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            {actionLoading === token.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tokens.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="text-[var(--text-muted)] mb-4">No MCP API tokens yet</div>
          {canManageTokens && (
            <button
              onClick={() => setShowGenerator(true)}
              className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
            >
              Generate Your First Token
            </button>
          )}
        </div>
      )}

      {/* Usage Guide */}
      <div className="mt-8 glass rounded-2xl p-6">
        <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">How to Use MCP Tokens</h2>
        <div className="space-y-4 text-sm text-[var(--text-secondary)]">
          <div>
            <h3 className="text-[var(--text-primary)] font-medium mb-2">1. Add to Claude Code settings</h3>
            <pre className="bg-[var(--bg-tertiary)] p-3 rounded-lg overflow-x-auto">
{`{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://your-domain/api/mcp",
      "headers": {
        "Authorization": "Bearer mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}`}
            </pre>
          </div>
          <div>
            <h3 className="text-[var(--text-primary)] font-medium mb-2">2. Or use with curl</h3>
            <pre className="bg-[var(--bg-tertiary)] p-3 rounded-lg overflow-x-auto">
{`curl -X POST https://your-domain/api/mcp?action=list \\
  -H "Authorization: Bearer mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{}'`}
            </pre>
          </div>
          <div>
            <p className="text-[var(--text-muted)]">
              Tokens provide per-token rate limiting and usage tracking.
              Without authentication, standard IP-based rate limiting applies (100 req/min).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
