'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// Types
interface TrendData {
  date?: string
  week?: string
  month?: string
  count: number
}

interface TopItem {
  id: string
  name: string
  type: string
  authorName: string
  installCount: number
}

interface RecentInstallation {
  id: string
  itemId: string
  itemName: string
  itemType: string
  method: string
  createdAt: string
}

interface RecentItem {
  id: string
  name: string
  type: string
  authorName: string
  createdAt: string
}

interface CategoryData {
  id: string
  label: string
  count: number
}

interface StatsData {
  period: string
  summary: {
    totalItems: number
    totalInstallations: number
    avgInstallationsPerDay: number
    topMethod: string
  }
  trends: {
    daily: TrendData[]
    weekly: TrendData[]
    monthly: TrendData[]
  }
  topItems: TopItem[]
  typeDistribution: {
    skill: number
    agent: number
    command: number
    guide: number
    hook: number
  }
  installationsByMethod: Record<string, number>
  categoryDistribution: CategoryData[]
  recentActivity: {
    installations: RecentInstallation[]
    newItems: RecentItem[]
  }
}

type Period = '7d' | '30d' | '90d'
type TrendType = 'daily' | 'weekly' | 'monthly'

// Colors for charts
const TYPE_COLORS: Record<string, string> = {
  skill: '#F26522',
  agent: '#8B5CF6',
  command: '#10B981',
  guide: '#3B82F6',
  hook: '#EC4899',
}

const METHOD_COLORS: Record<string, string> = {
  cli: '#F26522',
  mcp: '#8B5CF6',
  plugin: '#10B981',
  manual_content: '#3B82F6',
  manual_folder: '#EC4899',
  manual_file: '#F59E0B',
}

const METHOD_LABELS: Record<string, string> = {
  cli: 'CLI',
  mcp: 'MCP Prompt',
  plugin: 'Plugin',
  manual_content: 'Manual Copy',
  manual_folder: 'Folder Command',
  manual_file: 'File Path',
}

// Chart components
function BarChart({ data, labelKey, valueKey, maxBars = 10 }: {
  data: Array<Record<string, unknown>>
  labelKey: string
  valueKey: string
  maxBars?: number
}) {
  const displayData = data.slice(0, maxBars)
  const maxValue = Math.max(...displayData.map(d => Number(d[valueKey]) || 0))

  return (
    <div className="space-y-2">
      {displayData.map((item, i) => {
        const value = Number(item[valueKey]) || 0
        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-xs text-[var(--text-muted)] truncate">
              {String(item[labelKey])}
            </div>
            <div className="flex-1 h-6 bg-[var(--bg-secondary)] rounded-lg overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#F26522] to-[#FF8C42] rounded-lg transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm font-medium text-[var(--text-primary)]">
              {value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LineChart({ data, dateKey, valueKey }: {
  data: TrendData[]
  dateKey: 'date' | 'week' | 'month'
  valueKey: keyof TrendData
}) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-[var(--text-muted)]">
        No data available
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => Number(d[valueKey]) || 0))
  const chartHeight = 160

  // Show fewer labels for better readability
  const labelInterval = Math.ceil(data.length / 7)

  return (
    <div className="relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-xs text-[var(--text-muted)]">
        <span>{maxValue}</span>
        <span>{Math.round(maxValue / 2)}</span>
        <span>0</span>
      </div>

      {/* Chart area */}
      <div className="ml-10">
        <svg
          className="w-full"
          viewBox={`0 0 ${data.length * 20} ${chartHeight}`}
          preserveAspectRatio="none"
          style={{ height: chartHeight }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line
              key={i}
              x1="0"
              y1={chartHeight - ratio * chartHeight}
              x2={data.length * 20}
              y2={chartHeight - ratio * chartHeight}
              stroke="var(--border-subtle)"
              strokeDasharray="4"
            />
          ))}

          {/* Area fill */}
          <path
            d={`
              M 0 ${chartHeight}
              ${data.map((d, i) => {
                const value = Number(d[valueKey]) || 0
                const y = maxValue > 0 ? chartHeight - (value / maxValue) * chartHeight : chartHeight
                return `L ${i * 20 + 10} ${y}`
              }).join(' ')}
              L ${(data.length - 1) * 20 + 10} ${chartHeight}
              Z
            `}
            fill="url(#gradient)"
            opacity="0.3"
          />

          {/* Line */}
          <path
            d={data.map((d, i) => {
              const value = Number(d[valueKey]) || 0
              const y = maxValue > 0 ? chartHeight - (value / maxValue) * chartHeight : chartHeight
              return `${i === 0 ? 'M' : 'L'} ${i * 20 + 10} ${y}`
            }).join(' ')}
            fill="none"
            stroke="#F26522"
            strokeWidth="2"
          />

          {/* Points */}
          {data.map((d, i) => {
            const value = Number(d[valueKey]) || 0
            const y = maxValue > 0 ? chartHeight - (value / maxValue) * chartHeight : chartHeight
            return (
              <circle
                key={i}
                cx={i * 20 + 10}
                cy={y}
                r="3"
                fill="#F26522"
              />
            )
          })}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F26522" />
              <stop offset="100%" stopColor="#F26522" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)] overflow-hidden">
          {data.map((d, i) => (
            <span
              key={i}
              className={`${i % labelInterval === 0 ? 'opacity-100' : 'opacity-0'} truncate`}
              style={{ width: `${100 / data.length}%`, textAlign: 'center' }}
            >
              {formatDateLabel(String(d[dateKey]), dateKey)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDateLabel(date: string, type: 'date' | 'week' | 'month'): string {
  if (type === 'month') {
    const [_year, month] = date.split('-')
    return `${month}월`
  }
  if (type === 'week') {
    const d = new Date(date)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  // Daily
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function PieChart({ data, colorMap }: {
  data: Record<string, number>
  colorMap: Record<string, string>
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[var(--text-muted)]">
        No data
      </div>
    )
  }

  let currentAngle = 0
  const segments = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const percentage = (value / total) * 100
      const angle = (value / total) * 360
      const startAngle = currentAngle
      currentAngle += angle
      return { key, value, percentage, startAngle, endAngle: currentAngle }
    })

  const radius = 60
  const cx = 70
  const cy = 70

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="w-32 h-32">
        {segments.map((seg, i) => {
          const startRad = (seg.startAngle - 90) * (Math.PI / 180)
          const endRad = (seg.endAngle - 90) * (Math.PI / 180)
          const x1 = cx + radius * Math.cos(startRad)
          const y1 = cy + radius * Math.sin(startRad)
          const x2 = cx + radius * Math.cos(endRad)
          const y2 = cy + radius * Math.sin(endRad)
          const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0

          return (
            <path
              key={i}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={colorMap[seg.key] || '#888'}
              className="transition-opacity hover:opacity-80"
            />
          )
        })}
        {/* Center circle for donut effect */}
        <circle cx={cx} cy={cy} r={30} fill="var(--bg-primary)" />
        <text x={cx} y={cy} textAnchor="middle" dy="0.35em" className="text-sm font-semibold" fill="var(--text-primary)">
          {total}
        </text>
      </svg>

      <div className="flex flex-col gap-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: colorMap[seg.key] || '#888' }}
            />
            <span className="text-[var(--text-secondary)]">
              {seg.key}: {seg.value} ({seg.percentage.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ title, value, subtitle, icon }: {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
}) {
  return (
    <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-1">{title}</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">{value}</p>
          {subtitle && (
            <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>
          )}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </div>
  )
}

// Main dashboard component
export function StatsDashboard() {
  const [period, setPeriod] = useState<Period>('30d')
  const [trendType, setTrendType] = useState<TrendType>('daily')
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/stats?period=${period}`)
      if (!res.ok) {
        throw new Error('Failed to fetch stats')
      }
      const data = await res.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-[var(--bg-secondary)] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-[var(--bg-secondary)] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-2xl bg-[var(--bg-secondary)] animate-pulse" />
          <div className="h-80 rounded-2xl bg-[var(--bg-secondary)] animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="px-4 py-2 rounded-lg bg-[#F26522] text-white hover:bg-[#E55A1B]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  // Get trend data based on selected type
  const trendData = stats.trends[trendType]
  const dateKey = trendType === 'daily' ? 'date' : trendType === 'weekly' ? 'week' : 'month'

  return (
    <div className="space-y-8">
      {/* Period filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium text-[var(--text-primary)]">Overview</h2>
        <div className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-xl p-1">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === p
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Items"
          value={stats.summary.totalItems}
          icon="📦"
        />
        <StatCard
          title="Total Installations"
          value={stats.summary.totalInstallations.toLocaleString()}
          subtitle={`Last ${period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days'}`}
          icon="📥"
        />
        <StatCard
          title="Avg. Daily Installs"
          value={stats.summary.avgInstallationsPerDay}
          icon="📊"
        />
        <StatCard
          title="Top Install Method"
          value={METHOD_LABELS[stats.summary.topMethod] || stats.summary.topMethod}
          icon="🎯"
        />
      </div>

      {/* Installation trend chart */}
      <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Installation Trend</h3>
          <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-lg p-1">
            {(['daily', 'weekly', 'monthly'] as TrendType[]).map(t => (
              <button
                key={t}
                onClick={() => setTrendType(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  trendType === t
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <LineChart data={trendData} dateKey={dateKey} valueKey="count" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 items */}
        <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Top 10 Popular Items</h3>
          <div className="space-y-3">
            {stats.topItems.length > 0 ? (
              stats.topItems.map((item, i) => (
                <Link
                  key={item.id}
                  href={`/${item.type}/${item.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] transition-colors"
                >
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-xs font-medium text-[var(--text-muted)]">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item.authorName}</p>
                  </div>
                  <span
                    className="px-2 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: `${TYPE_COLORS[item.type]}20`,
                      color: TYPE_COLORS[item.type]
                    }}
                  >
                    {item.type}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {item.installCount}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-center text-[var(--text-muted)] py-8">No installation data yet</p>
            )}
          </div>
        </div>

        {/* Distribution charts */}
        <div className="space-y-6">
          {/* Type distribution */}
          <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Content Type Distribution</h3>
            <PieChart data={stats.typeDistribution} colorMap={TYPE_COLORS} />
          </div>

          {/* Installation method distribution */}
          <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Installation Methods</h3>
            <PieChart
              data={Object.fromEntries(
                Object.entries(stats.installationsByMethod).map(([k, v]) => [METHOD_LABELS[k] || k, v])
              )}
              colorMap={Object.fromEntries(
                Object.entries(METHOD_COLORS).map(([k, v]) => [METHOD_LABELS[k] || k, v])
              )}
            />
          </div>
        </div>
      </div>

      {/* Category distribution */}
      <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Top Categories</h3>
        {stats.categoryDistribution.length > 0 ? (
          <BarChart
            data={stats.categoryDistribution.map(c => ({ label: c.label, count: c.count }))}
            labelKey="label"
            valueKey="count"
          />
        ) : (
          <p className="text-center text-[var(--text-muted)] py-8">No category data</p>
        )}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent installations */}
        <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Recent Installations</h3>
          <div className="space-y-3">
            {stats.recentActivity.installations.length > 0 ? (
              stats.recentActivity.installations.map(inst => (
                <div key={inst.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)]">
                  <span className="text-xl">📥</span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${inst.itemType}/${inst.itemId}`}
                      className="text-sm font-medium text-[var(--text-primary)] hover:text-[#F26522] truncate block"
                    >
                      {inst.itemName}
                    </Link>
                    <p className="text-xs text-[var(--text-muted)]">
                      via {METHOD_LABELS[inst.method] || inst.method}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatTimeAgo(inst.createdAt)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-center text-[var(--text-muted)] py-8">No recent installations</p>
            )}
          </div>
        </div>

        {/* Recently added items */}
        <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Recently Added</h3>
          <div className="space-y-3">
            {stats.recentActivity.newItems.length > 0 ? (
              stats.recentActivity.newItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)]">
                  <span className="text-xl">✨</span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${item.type}/${item.id}`}
                      className="text-sm font-medium text-[var(--text-primary)] hover:text-[#F26522] truncate block"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-[var(--text-muted)]">by {item.authorName}</p>
                  </div>
                  <span
                    className="px-2 py-1 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: `${TYPE_COLORS[item.type]}20`,
                      color: TYPE_COLORS[item.type]
                    }}
                  >
                    {item.type}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatTimeAgo(item.createdAt)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-center text-[var(--text-muted)] py-8">No new items in this period</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
