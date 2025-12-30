'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import MCPTokenGenerator from '@/components/features/mcp/MCPTokenGenerator'

interface TokenInfo {
  id: string
  name: string
  description?: string | null
  expiresAt?: string | null
  lastUsedAt?: string | null
  usageCount: number
  rateLimit: number
  isActive: boolean
  createdAt: string
}

interface TokensData {
  tokens: TokenInfo[]
  count: number
  maxTokens: number
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '사용 기록 없음'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '방금 전'
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return formatDate(dateString)
}

export default function TokensPage() {
  const [data, setData] = useState<TokensData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGenerator, setShowGenerator] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/user/mcp-tokens')
      if (!res.ok) {
        throw new Error('Failed to fetch tokens')
      }
      const result = await res.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  async function handleDelete(id: string, permanent: boolean = false) {
    if (!confirm(permanent ? '토큰을 영구 삭제하시겠습니까?' : '토큰을 비활성화하시겠습니까?')) {
      return
    }

    setDeletingId(id)
    try {
      const url = `/api/user/mcp-tokens?id=${id}${permanent ? '&permanent=true' : ''}`
      const res = await fetch(url, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete token')
      }

      await fetchTokens()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete token')
    } finally {
      setDeletingId(null)
    }
  }

  function handleGeneratorSuccess() {
    setShowGenerator(false)
    fetchTokens()
  }

  if (loading) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen grid-pattern noise-overlay flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-20">⚠️</div>
          <p className="text-[var(--text-secondary)]">{error || 'Failed to load tokens'}</p>
          <Link href="/profile" className="text-[var(--accent-cyan)] hover:underline mt-4 inline-block">
            ← Back to Profile
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-4xl mx-auto px-8 py-5">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
          >
            <span>←</span>
            <span>Back to Profile</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-8 py-12">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium text-[var(--text-primary)] mb-2">
              MCP API Tokens
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Claude Code MCP 서버 연결을 위한 API 토큰을 관리합니다.
            </p>
          </div>
          {data.count < data.maxTokens && !showGenerator && (
            <button
              onClick={() => setShowGenerator(true)}
              className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <span>+</span>
              <span>새 토큰 생성</span>
            </button>
          )}
        </div>

        {/* Token Generator Modal */}
        {showGenerator && (
          <div className="glass rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">새 토큰 생성</h2>
              <button
                onClick={() => setShowGenerator(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            <MCPTokenGenerator
              apiEndpoint="/api/user/mcp-tokens"
              showRateLimitSelect={false}
              onSuccess={handleGeneratorSuccess}
              onCancel={() => setShowGenerator(false)}
            />
          </div>
        )}

        {/* Token Count Info */}
        <div className="glass rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="text-sm text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)] font-medium">{data.count}</span>
            <span> / </span>
            <span>{data.maxTokens}</span>
            <span className="text-[var(--text-muted)]"> 토큰 사용 중</span>
          </div>
          {data.count >= data.maxTokens && (
            <div className="text-sm text-amber-400">
              토큰 한도에 도달했습니다. 새 토큰을 만들려면 기존 토큰을 삭제하세요.
            </div>
          )}
        </div>

        {/* Tokens List */}
        {data.tokens.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4 opacity-20">🔑</div>
            <p className="text-[var(--text-secondary)] mb-4">
              아직 생성한 MCP API 토큰이 없습니다.
            </p>
            <button
              onClick={() => setShowGenerator(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-cyan)] text-black text-sm font-medium hover:opacity-90 transition-opacity"
            >
              첫 번째 토큰 생성하기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {data.tokens.map((token) => (
              <div
                key={token.id}
                className={`glass rounded-xl p-5 ${!token.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-medium text-[var(--text-primary)] truncate">
                        {token.name}
                      </h3>
                      {!token.isActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                          Revoked
                        </span>
                      )}
                      {token.expiresAt && new Date(token.expiresAt) < new Date() && token.isActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Expired
                        </span>
                      )}
                    </div>
                    {token.description && (
                      <p className="text-sm text-[var(--text-muted)] mb-3 truncate">
                        {token.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)]">
                      <div>
                        <span className="text-[var(--text-secondary)]">생성: </span>
                        {formatDate(token.createdAt)}
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">만료: </span>
                        {token.expiresAt ? formatDate(token.expiresAt) : '무제한'}
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">마지막 사용: </span>
                        {formatRelativeTime(token.lastUsedAt)}
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">사용 횟수: </span>
                        {token.usageCount.toLocaleString()}회
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Rate Limit: </span>
                        {token.rateLimit}/min
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {token.isActive ? (
                      <button
                        onClick={() => handleDelete(token.id, false)}
                        disabled={deletingId === token.id}
                        className="px-3 py-1.5 text-sm rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                      >
                        {deletingId === token.id ? '...' : '비활성화'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(token.id, true)}
                        disabled={deletingId === token.id}
                        className="px-3 py-1.5 text-sm rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {deletingId === token.id ? '...' : '삭제'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 glass rounded-xl p-6">
          <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">
            사용 방법
          </h3>
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <div className="flex gap-3">
              <span className="text-[var(--accent-cyan)]">1.</span>
              <span>위에서 새 토큰을 생성합니다.</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[var(--accent-cyan)]">2.</span>
              <span>
                생성된 설정을{' '}
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]">
                  ~/.claude/settings.json
                </code>
                에 추가합니다.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-[var(--accent-cyan)]">3.</span>
              <span>Claude Code를 재시작하면 MCP 서버에 연결됩니다.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
