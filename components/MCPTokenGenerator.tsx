'use client'

import { useState } from 'react'

interface MCPTokenGeneratorProps {
  onSuccess?: () => void
  onCancel?: () => void
}

interface GeneratedToken {
  token: string
  id: string
  name: string
  description?: string
  expiresAt?: string
  rateLimit: number
  createdAt: string
}

// Get base URL for MCP endpoint
function getMcpEndpointUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/mcp`
  }
  return 'https://your-domain.com/api/mcp'
}

export default function MCPTokenGenerator({ onSuccess, onCancel }: MCPTokenGeneratorProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('never')
  const [rateLimit, setRateLimit] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedToken, setGeneratedToken] = useState<GeneratedToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedConfig, setCopiedConfig] = useState(false)
  const [activeTab, setActiveTab] = useState<'token' | 'config'>('config')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/admin/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          expiresIn: expiresIn === 'never' ? null : parseInt(expiresIn, 10),
          rateLimit: parseInt(rateLimit, 10),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create token')
      }

      const data = await res.json()
      setGeneratedToken(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token')
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard(text: string, type: 'token' | 'config') {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }

    if (type === 'token') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setCopiedConfig(true)
      setTimeout(() => setCopiedConfig(false), 2000)
    }
  }

  function getFullConfig(): string {
    if (!generatedToken) return ''
    return JSON.stringify({
      mcpServers: {
        'gpters-marketplace': {
          type: 'http',
          url: getMcpEndpointUrl(),
          headers: {
            Authorization: `Bearer ${generatedToken.token}`
          }
        }
      }
    }, null, 2)
  }

  // Show generated token with setup guide
  if (generatedToken) {
    return (
      <div className="space-y-4">
        {/* Success Banner */}
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">토큰이 생성되었습니다!</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            보안상 토큰은 이 화면에서만 확인할 수 있습니다. 지금 복사해주세요.
          </p>
        </div>

        {/* Token Info */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="p-2 rounded bg-[var(--bg-tertiary)]">
            <span className="text-[var(--text-muted)]">이름</span>
            <div className="text-[var(--text-primary)] truncate">{generatedToken.name}</div>
          </div>
          <div className="p-2 rounded bg-[var(--bg-tertiary)]">
            <span className="text-[var(--text-muted)]">Rate Limit</span>
            <div className="text-[var(--text-primary)]">{generatedToken.rateLimit}/min</div>
          </div>
          <div className="p-2 rounded bg-[var(--bg-tertiary)]">
            <span className="text-[var(--text-muted)]">만료</span>
            <div className="text-[var(--text-primary)]">
              {generatedToken.expiresAt
                ? new Date(generatedToken.expiresAt).toLocaleDateString('ko-KR')
                : '무제한'}
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-2 border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'config'
                ? 'border-[var(--accent-cyan)] text-[var(--accent-cyan)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            설정 복사 (권장)
          </button>
          <button
            onClick={() => setActiveTab('token')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'token'
                ? 'border-[var(--accent-cyan)] text-[var(--accent-cyan)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            토큰만 복사
          </button>
        </div>

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)]">
              아래 설정을 <code className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]">~/.claude/settings.json</code>에 추가하세요:
            </div>
            <div className="relative">
              <pre className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm font-mono overflow-x-auto text-[var(--text-secondary)]">
                {getFullConfig()}
              </pre>
              <button
                onClick={() => copyToClipboard(getFullConfig(), 'config')}
                className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  copiedConfig
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {copiedConfig ? '✓ 복사됨!' : '복사'}
              </button>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
              <strong>Tip:</strong> 기존 settings.json이 있다면 mcpServers 안에 gpters-marketplace 항목만 추가하세요.
            </div>
          </div>
        )}

        {/* Token Tab */}
        {activeTab === 'token' && (
          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)]">
              토큰 값만 필요한 경우:
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={generatedToken.token}
                readOnly
                className="flex-1 px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-cyan)] font-mono text-sm"
              />
              <button
                onClick={() => copyToClipboard(generatedToken.token, 'token')}
                className={`px-4 py-3 rounded-lg border transition-all ${
                  copied
                    ? 'bg-green-500/20 border-green-500/30 text-green-400'
                    : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-cyan)]'
                }`}
              >
                {copied ? '✓' : '복사'}
              </button>
            </div>
          </div>
        )}

        {/* Setup Steps */}
        <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] space-y-2">
          <div className="text-sm font-medium text-[var(--text-primary)]">설정 방법</div>
          <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
            <li>위 설정을 복사합니다</li>
            <li><code className="px-1 py-0.5 rounded bg-[var(--bg-primary)] text-xs">~/.claude/settings.json</code> 파일을 엽니다</li>
            <li>mcpServers 섹션에 붙여넣기 합니다</li>
            <li>Claude Code를 재시작합니다</li>
          </ol>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onSuccess}
            className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            완료
          </button>
        </div>
      </div>
    )
  }

  // Show form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-[var(--text-secondary)] mb-2">
          Token Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Production API Key"
          maxLength={100}
          required
          className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
        />
      </div>

      <div>
        <label className="block text-sm text-[var(--text-secondary)] mb-2">
          Description <span className="text-[var(--text-muted)]">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this token used for?"
          maxLength={500}
          rows={2}
          className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            Expires In
          </label>
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
          >
            <option value="never">Never</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            Rate Limit (req/min)
          </label>
          <select
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
          >
            <option value="10">10/min (very low)</option>
            <option value="30">30/min (low)</option>
            <option value="60">60/min (standard)</option>
            <option value="100">100/min (default)</option>
            <option value="200">200/min (high)</option>
            <option value="500">500/min (very high)</option>
            <option value="1000">1000/min (unlimited)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate Token'}
        </button>
      </div>
    </form>
  )
}
