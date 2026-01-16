/**
 * Security audit panel component
 *
 * Provides security scanning and vulnerability detection for catalog items.
 * Displays risk assessment, issue categorization, and recommendations.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  SecurityAuditResult,
  SecurityIssue,
  RiskLevel,
  IssueCategory,
} from '@/lib/security/security-audit'
import {
  RISK_LABELS,
  CATEGORY_LABELS,
  sortIssuesByRisk,
} from '@/lib/security/security-audit'

/** Props for SecurityAuditPanel component */
interface SecurityAuditPanelProps {
  /** Catalog item ID to audit */
  itemId?: string
  /** Raw content to audit (alternative to itemId) */
  content?: string
  /** Hook command to audit */
  hookCommand?: string
  /** Callback when audit completes */
  onAuditComplete?: (result: SecurityAuditResult) => void
  /** Whether to run audit automatically on mount */
  autoRun?: boolean
  /** Additional CSS classes */
  className?: string
}

/** Audit execution status */
type AuditStatus = 'idle' | 'running' | 'completed' | 'error'

/**
 * Security audit panel with vulnerability detection
 *
 * Features:
 * - Real-time security scanning via API
 * - Risk level categorization (critical, high, medium, low)
 * - Expandable issue details with recommendations
 * - Auto-run option for automated workflows
 */
export function SecurityAuditPanel({
  itemId,
  content,
  hookCommand,
  onAuditComplete,
  autoRun = false,
  className = '',
}: SecurityAuditPanelProps) {
  const [status, setStatus] = useState<AuditStatus>('idle')
  const [result, setResult] = useState<SecurityAuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set())

  const runAudit = useCallback(async () => {
    if (!itemId && !content) {
      setError('No content to audit')
      return
    }

    setStatus('running')
    setError(null)

    try {
      const response = await fetch('/api/admin/security-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          content,
          hookCommand,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Audit failed')
      }

      const auditResult: SecurityAuditResult = await response.json()
      setResult(auditResult)
      setStatus('completed')
      onAuditComplete?.(auditResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [itemId, content, hookCommand, onAuditComplete])

  useEffect(() => {
    if (autoRun && (itemId || content)) {
      runAudit()
    }
  }, [autoRun, itemId, content, runAudit])

  const toggleIssue = (issueId: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev)
      if (next.has(issueId)) {
        next.delete(issueId)
      } else {
        next.add(issueId)
      }
      return next
    })
  }

  const getRiskBadge = (risk: RiskLevel) => {
    const { label, color, bgColor } = RISK_LABELS[risk]
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${color}`}>
        {label}
      </span>
    )
  }

  const getCategoryBadge = (category: IssueCategory) => {
    const { label, icon } = CATEGORY_LABELS[category]
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
        {icon} {label}
      </span>
    )
  }

  const renderSummary = () => {
    if (!result) return null

    const { summary, overallRisk, passed } = result

    return (
      <div className="space-y-4">
        {/* Overall Status */}
        <div className={`flex items-center justify-between p-4 rounded-lg ${
          passed
            ? 'bg-green-500/10 border border-green-500/30'
            : 'bg-red-500/10 border border-red-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{passed ? '✅' : '⚠️'}</span>
            <div>
              <p className={`font-medium ${passed ? 'text-green-400' : 'text-red-400'}`}>
                {passed ? 'Security Check Passed' : 'Security Issues Found'}
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                {summary.total} issue{summary.total !== 1 ? 's' : ''} detected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">Overall Risk:</span>
            {getRiskBadge(overallRisk)}
          </div>
        </div>

        {/* Issue Breakdown */}
        {summary.total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
              <p className="text-2xl font-bold text-red-400">{summary.critical}</p>
              <p className="text-xs text-[var(--text-muted)]">Critical</p>
            </div>
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-center">
              <p className="text-2xl font-bold text-orange-400">{summary.high}</p>
              <p className="text-xs text-[var(--text-muted)]">High</p>
            </div>
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
              <p className="text-2xl font-bold text-yellow-400">{summary.medium}</p>
              <p className="text-xs text-[var(--text-muted)]">Medium</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
              <p className="text-2xl font-bold text-blue-400">{summary.low}</p>
              <p className="text-xs text-[var(--text-muted)]">Low</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderIssue = (issue: SecurityIssue) => {
    const isExpanded = expandedIssues.has(issue.id)

    return (
      <div
        key={issue.id}
        className="border border-[var(--border-subtle)] rounded-lg overflow-hidden"
      >
        <button
          type="button"
          onClick={() => toggleIssue(issue.id)}
          className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            {getRiskBadge(issue.riskLevel)}
            <span className="font-medium text-[var(--text-primary)]">{issue.title}</span>
            {issue.location && (
              <span className="text-xs text-[var(--text-muted)] font-mono">
                @ {issue.location}
                {issue.lineNumber && `:${issue.lineNumber}`}
              </span>
            )}
          </div>
          <span className="text-[var(--text-muted)]">
            {isExpanded ? '▼' : '▶'}
          </span>
        </button>

        {isExpanded && (
          <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)] space-y-3">
            <div className="flex gap-2">
              {getCategoryBadge(issue.category)}
            </div>

            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-1">Description:</p>
              <p className="text-sm text-[var(--text-primary)]">{issue.description}</p>
            </div>

            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-1">Matched Pattern:</p>
              <code className="block text-xs p-2 rounded bg-[var(--bg-primary)] text-[var(--accent-cyan)] font-mono overflow-x-auto">
                {issue.matchedPattern}
              </code>
            </div>

            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-sm text-green-400 font-medium mb-1">Recommendation:</p>
              <p className="text-sm text-[var(--text-primary)]">{issue.recommendation}</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderIssues = () => {
    if (!result || result.issues.length === 0) return null

    const sortedIssues = sortIssuesByRisk(result.issues)

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--text-secondary)]">
          Detected Issues ({result.issues.length})
        </h4>
        <div className="space-y-2">
          {sortedIssues.map(renderIssue)}
        </div>
      </div>
    )
  }

  return (
    <div className={`glass rounded-2xl p-6 space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
          <span>🔒</span> Security Audit
        </h3>
        <button
          type="button"
          onClick={runAudit}
          disabled={status === 'running'}
          className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-black text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'running' ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span> Scanning...
            </span>
          ) : (
            'Run Audit'
          )}
        </button>
      </div>

      {status === 'idle' && (
        <div className="text-center py-8 text-[var(--text-muted)]">
          <p>Click &quot;Run Audit&quot; to scan for security issues</p>
        </div>
      )}

      {status === 'running' && (
        <div className="text-center py-8">
          <div className="animate-pulse">
            <p className="text-[var(--text-muted)]">Analyzing content for security patterns...</p>
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-400">{error}</p>
          <button
            type="button"
            onClick={runAudit}
            className="mt-2 text-sm text-[var(--accent-cyan)] hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'completed' && result && (
        <>
          {renderSummary()}
          {renderIssues()}

          <div className="text-xs text-[var(--text-muted)] text-right">
            Audited at: {new Date(result.auditedAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Compact security audit badge for list views
 *
 * Displays audit status as a small badge with pass/fail indication.
 * Useful for inline display in catalog lists.
 */
export function SecurityAuditBadge({
  result,
  onClick,
}: {
  /** Audit result to display (null if not yet audited) */
  result: SecurityAuditResult | null
  /** Click handler to open full audit panel */
  onClick?: () => void
}) {
  if (!result) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] transition-colors"
      >
        🔒 Not audited
      </button>
    )
  }

  const { passed, summary, overallRisk } = result
  const { color, bgColor } = RISK_LABELS[overallRisk]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium ${bgColor} ${color} hover:opacity-80 transition-opacity flex items-center gap-1`}
    >
      {passed ? '✅' : '⚠️'}
      <span>
        {passed ? 'Passed' : `${summary.total} issue${summary.total !== 1 ? 's' : ''}`}
      </span>
    </button>
  )
}
