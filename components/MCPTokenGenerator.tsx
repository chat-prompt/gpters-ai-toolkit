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

export default function MCPTokenGenerator({ onSuccess, onCancel }: MCPTokenGeneratorProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('never')
  const [rateLimit, setRateLimit] = useState('100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedToken, setGeneratedToken] = useState<GeneratedToken | null>(null)
  const [copied, setCopied] = useState(false)

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

  async function handleCopy() {
    if (!generatedToken) return

    try {
      await navigator.clipboard.writeText(generatedToken.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = generatedToken.token
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Show generated token
  if (generatedToken) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">Token Created Successfully</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Copy this token now. For security, it will not be shown again.
          </p>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            Your API Token
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={generatedToken.token}
              readOnly
              className="flex-1 px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-cyan)] font-mono text-sm"
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-3 rounded-lg border transition-all ${
                copied
                  ? 'bg-green-500/20 border-green-500/30 text-green-400'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-cyan)]'
              }`}
            >
              {copied ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[var(--text-muted)]">Name:</span>
            <span className="ml-2 text-[var(--text-primary)]">{generatedToken.name}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Rate Limit:</span>
            <span className="ml-2 text-[var(--text-primary)]">{generatedToken.rateLimit}/min</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Expires:</span>
            <span className="ml-2 text-[var(--text-primary)]">
              {generatedToken.expiresAt
                ? new Date(generatedToken.expiresAt).toLocaleDateString('ko-KR')
                : 'Never'}
            </span>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            onClick={onSuccess}
            className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            Done
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
