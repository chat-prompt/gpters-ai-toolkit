/**
 * Performance monitoring dashboard
 *
 * Displays real-time performance metrics including request counts,
 * success rates, response times, and detailed metric breakdowns.
 */
'use client'

import { useState, useEffect, useCallback } from 'react'

/** Performance summary data structure */
interface PerformanceSummary {
  totalRequests: number
  successRate: number
  avgResponseTime: number
  avgResponseTimeFormatted: string
  byType: Record<string, {
    count: number
    avgDuration: number
    avgDurationFormatted: string
  }>
}

interface AggregatedMetric {
  name: string
  type: string
  count: number
  successCount: number
  failureCount: number
  avgDuration: number
  avgDurationFormatted: string
  minDurationFormatted: string
  maxDurationFormatted: string
  p50DurationFormatted: string
  p95DurationFormatted: string
  p99DurationFormatted: string
  successRate: string
  lastUpdated: number
}

/**
 * Main performance monitoring dashboard component
 *
 * Features auto-refresh, type filtering, and detailed metrics table
 */
export function PerformanceDashboard() {
  const [summary, setSummary] = useState<PerformanceSummary | null>(null)
  const [metrics, setMetrics] = useState<AggregatedMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedType, setSelectedType] = useState<string>('all')

  const fetchData = useCallback(async () => {
    try {
      // Fetch summary
      const summaryRes = await fetch('/api/admin/performance?view=summary')
      const summaryData = await summaryRes.json()
      if (summaryData.success) {
        setSummary(summaryData.data)
      }

      // Fetch aggregated metrics
      const typeParam = selectedType !== 'all' ? `&type=${selectedType}` : ''
      const metricsRes = await fetch(`/api/admin/performance?view=aggregated${typeParam}`)
      const metricsData = await metricsRes.json()
      if (metricsData.success) {
        setMetrics(metricsData.data)
      }

      setError(null)
    } catch {
      setError('Failed to fetch performance data')
    } finally {
      setLoading(false)
    }
  }, [selectedType])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-xl p-6 border border-[var(--border-subtle)]">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-[var(--bg-tertiary)] rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-[var(--bg-tertiary)] rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Performance Monitoring
        </h2>
        <div className="flex items-center gap-4">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]"
          >
            <option value="all">All Types</option>
            <option value="api">API</option>
            <option value="hook">Hook</option>
            <option value="db">Database</option>
            <option value="external">External</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Requests"
            value={summary.totalRequests.toLocaleString()}
            subtitle="Last hour"
          />
          <SummaryCard
            title="Success Rate"
            value={`${summary.successRate.toFixed(1)}%`}
            subtitle="Last hour"
            status={summary.successRate >= 99 ? 'success' : summary.successRate >= 95 ? 'warning' : 'error'}
          />
          <SummaryCard
            title="Avg Response Time"
            value={summary.avgResponseTimeFormatted}
            subtitle="Last hour"
          />
          <SummaryCard
            title="Metric Types"
            value={Object.keys(summary.byType).length.toString()}
            subtitle="Active"
          />
        </div>
      )}

      {/* Type Breakdown */}
      {summary && Object.keys(summary.byType).length > 0 && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 border border-[var(--border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            By Type
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(summary.byType).map(([type, data]) => (
              <div
                key={type}
                className="bg-[var(--bg-tertiary)] rounded-lg p-3"
              >
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                  {type}
                </div>
                <div className="text-lg font-semibold text-[var(--text-primary)] mt-1">
                  {data.count.toLocaleString()}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {data.avgDurationFormatted} avg
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Metrics Table */}
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">
            Detailed Metrics
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-tertiary)]">
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">
                  Type
                </th>
                <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">
                  Count
                </th>
                <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">
                  Success
                </th>
                <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">
                  Avg
                </th>
                <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">
                  P95
                </th>
                <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">
                  P99
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No metrics recorded yet. Metrics will appear after API usage.
                  </td>
                </tr>
              ) : (
                metrics.map((metric, i) => (
                  <tr
                    key={`${metric.name}-${i}`}
                    className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)]"
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)] font-mono text-xs">
                      {metric.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        metric.type === 'api' ? 'bg-blue-500/20 text-blue-400' :
                        metric.type === 'hook' ? 'bg-purple-500/20 text-purple-400' :
                        metric.type === 'db' ? 'bg-green-500/20 text-green-400' :
                        metric.type === 'external' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {metric.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                      {metric.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={
                        parseFloat(metric.successRate) >= 99 ? 'text-green-400' :
                        parseFloat(metric.successRate) >= 95 ? 'text-yellow-400' :
                        'text-red-400'
                      }>
                        {metric.successRate}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] font-mono text-xs">
                      {metric.avgDurationFormatted}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] font-mono text-xs">
                      {metric.p95DurationFormatted}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] font-mono text-xs">
                      {metric.p99DurationFormatted}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** Props for SummaryCard component */
interface SummaryCardProps {
  title: string
  value: string
  subtitle: string
  status?: 'success' | 'warning' | 'error'
}

/** Summary statistic card with optional status indicator */
function SummaryCard({ title, value, subtitle, status }: SummaryCardProps) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-subtle)]">
      <div className="text-sm text-[var(--text-muted)]">{title}</div>
      <div className={`text-2xl font-bold mt-1 ${
        status === 'success' ? 'text-green-400' :
        status === 'warning' ? 'text-yellow-400' :
        status === 'error' ? 'text-red-400' :
        'text-[var(--text-primary)]'
      }`}>
        {value}
      </div>
      <div className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</div>
    </div>
  )
}
