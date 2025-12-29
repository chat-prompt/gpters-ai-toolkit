'use client'

import { useState, useMemo } from 'react'
import {
  type TimePeriod,
  type RankingCategory,
  type PluginStats,
  type RankingEntry,
  type MarketplaceOverview,
  type TrendInsight,
  getPluginRanking,
  createMarketplaceOverview,
  analyzeTrends,
  formatNumber,
  formatChange,
  getPeriodLabel,
  getRankingCategoryLabel,
} from '@/lib/plugin/marketplace-stats'

// ============================================
// Main Dashboard Component
// ============================================

interface MarketplaceStatsDashboardProps {
  plugins: PluginStats[]
  initialPeriod?: TimePeriod
  showOverview?: boolean
  showRankings?: boolean
  showTrends?: boolean
}

export function MarketplaceStatsDashboard({
  plugins,
  initialPeriod = 'week',
  showOverview = true,
  showRankings = true,
  showTrends = true,
}: MarketplaceStatsDashboardProps) {
  const [period, setPeriod] = useState<TimePeriod>(initialPeriod)
  const [rankingCategory, setRankingCategory] = useState<RankingCategory>('downloads')

  const overview = useMemo(() => createMarketplaceOverview(plugins), [plugins])
  const rankings = useMemo(
    () => getPluginRanking(plugins, rankingCategory),
    [plugins, rankingCategory]
  )

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <PeriodSelector period={period} onChange={setPeriod} />

      {/* Overview Section */}
      {showOverview && <MarketplaceOverviewCard overview={overview} />}

      {/* Rankings Section */}
      {showRankings && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">플러그인 랭킹</h2>
            <RankingCategorySelector category={rankingCategory} onChange={setRankingCategory} />
          </div>
          <RankingTable rankings={rankings} category={rankingCategory} />
        </div>
      )}

      {/* Trends Section */}
      {showTrends && plugins.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">트렌드 분석</h2>
          <TrendInsightsList plugin={plugins[0]} period={period} />
        </div>
      )}
    </div>
  )
}

// ============================================
// Period Selector
// ============================================

interface PeriodSelectorProps {
  period: TimePeriod
  onChange: (period: TimePeriod) => void
}

export function PeriodSelector({ period, onChange }: PeriodSelectorProps) {
  const periods: TimePeriod[] = ['day', 'week', 'month', 'quarter', 'year', 'all']

  return (
    <div className="flex gap-2">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            period === p
              ? 'bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {getPeriodLabel(p)}
        </button>
      ))}
    </div>
  )
}

// ============================================
// Ranking Category Selector
// ============================================

interface RankingCategorySelectorProps {
  category: RankingCategory
  onChange: (category: RankingCategory) => void
}

export function RankingCategorySelector({ category, onChange }: RankingCategorySelectorProps) {
  const categories: RankingCategory[] = ['downloads', 'installs', 'rating', 'reviews', 'trending', 'new']

  return (
    <select
      value={category}
      onChange={(e) => onChange(e.target.value as RankingCategory)}
      className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
    >
      {categories.map((cat) => (
        <option key={cat} value={cat}>
          {getRankingCategoryLabel(cat)}
        </option>
      ))}
    </select>
  )
}

// ============================================
// Marketplace Overview Card
// ============================================

interface MarketplaceOverviewCardProps {
  overview: MarketplaceOverview
}

export function MarketplaceOverviewCard({ overview }: MarketplaceOverviewCardProps) {
  const stats = [
    {
      label: '전체 플러그인',
      value: formatNumber(overview.totalPlugins),
      change: overview.growth.plugins,
      icon: '📦',
    },
    {
      label: '총 다운로드',
      value: formatNumber(overview.totalDownloads),
      change: overview.growth.downloads,
      icon: '⬇️',
    },
    {
      label: '활성 사용자',
      value: formatNumber(overview.activeUsers),
      change: overview.growth.users,
      icon: '👥',
    },
    {
      label: '평균 평점',
      value: overview.avgRating.toFixed(1),
      icon: '⭐',
    },
    {
      label: '총 리뷰',
      value: formatNumber(overview.totalReviews),
      icon: '💬',
    },
    {
      label: '이번 주 신규',
      value: overview.newPluginsThisWeek.toString(),
      icon: '🆕',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  )
}

// ============================================
// Stat Card
// ============================================

interface StatCardProps {
  label: string
  value: string
  change?: number
  icon: string
}

export function StatCard({ label, value, change, icon }: StatCardProps) {
  const changeInfo = change !== undefined ? formatChange(change) : null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {changeInfo && (
          <span className={`text-sm font-medium ${changeInfo.color}`}>
            {changeInfo.icon} {changeInfo.text}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

// ============================================
// Ranking Table
// ============================================

interface RankingTableProps {
  rankings: RankingEntry[]
  category: RankingCategory
}

export function RankingTable({ rankings, category: _category }: RankingTableProps) {
  if (rankings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
        랭킹 데이터가 없습니다
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-900">
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">순위</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">플러그인</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">다운로드</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">평점</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">리뷰</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">변동</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((entry) => (
            <RankingRow key={entry.pluginId} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================
// Ranking Row
// ============================================

interface RankingRowProps {
  entry: RankingEntry
}

export function RankingRow({ entry }: RankingRowProps) {
  const rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : ''

  const changeConfig = {
    up: { icon: '↑', color: 'text-green-400', bg: 'bg-green-500/10' },
    down: { icon: '↓', color: 'text-red-400', bg: 'bg-red-500/10' },
    same: { icon: '→', color: 'text-gray-400', bg: 'bg-gray-500/10' },
    new: { icon: '✨', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  }

  const change = changeConfig[entry.change]

  return (
    <tr className="border-b border-gray-700/50 hover:bg-gray-700/30">
      <td className="px-4 py-3">
        <span className="font-medium text-white">
          {rankIcon} #{entry.rank}
        </span>
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-white">{entry.pluginName}</p>
          <p className="text-sm text-gray-400">{entry.author}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-white">
        {formatNumber(entry.stats.downloads)}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-yellow-400">★ {entry.stats.rating.toFixed(1)}</span>
      </td>
      <td className="px-4 py-3 text-right text-gray-300">{entry.stats.reviews}</td>
      <td className="px-4 py-3 text-right">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${change.bg} ${change.color}`}
        >
          {change.icon}
          {entry.changeAmount !== undefined && Math.abs(entry.changeAmount)}
        </span>
      </td>
    </tr>
  )
}

// ============================================
// Trend Insights List
// ============================================

interface TrendInsightsListProps {
  plugin: PluginStats
  period: TimePeriod
}

export function TrendInsightsList({ plugin, period }: TrendInsightsListProps) {
  const analysis = useMemo(() => analyzeTrends(plugin, period), [plugin, period])

  if (analysis.insights.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6 text-center text-gray-400">
        현재 특별한 트렌드가 발견되지 않았습니다
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {analysis.insights.map((insight, index) => (
        <TrendInsightCard key={index} insight={insight} />
      ))}
    </div>
  )
}

// ============================================
// Trend Insight Card
// ============================================

interface TrendInsightCardProps {
  insight: TrendInsight
}

export function TrendInsightCard({ insight }: TrendInsightCardProps) {
  const typeConfig = {
    growth: { icon: '📈', color: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-500/10' },
    decline: { icon: '📉', color: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10' },
    spike: { icon: '⚡', color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10' },
    anomaly: { icon: '🔍', color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
    milestone: { icon: '🏆', color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
  }

  const config = typeConfig[insight.type]

  const significanceBadge = {
    high: 'bg-red-500/20 text-red-300',
    medium: 'bg-yellow-500/20 text-yellow-300',
    low: 'bg-gray-500/20 text-gray-300',
  }

  return (
    <div className={`rounded-lg border p-4 ${config.border} ${config.bg}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`font-medium ${config.color}`}>{insight.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs ${significanceBadge[insight.significance]}`}>
              {insight.significance === 'high' ? '높음' : insight.significance === 'medium' ? '보통' : '낮음'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-300">{insight.description}</p>
          {insight.value !== undefined && (
            <p className="mt-2 text-lg font-bold text-white">
              {typeof insight.value === 'number' && insight.value % 1 !== 0
                ? insight.value.toFixed(1)
                : insight.value}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Plugin Stats Card
// ============================================

interface PluginStatsCardProps {
  stats: PluginStats
  showTrends?: boolean
  compact?: boolean
}

export function PluginStatsCard({ stats, showTrends = true, compact = false }: PluginStatsCardProps) {
  const trendIcon = stats.trends.trendDirection === 'up' ? '📈' : stats.trends.trendDirection === 'down' ? '📉' : '➡️'

  if (compact) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-800 p-3">
        <div className="flex-1">
          <h3 className="font-medium text-white">{stats.pluginName}</h3>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>⬇️ {formatNumber(stats.downloads.total)}</span>
            <span>⭐ {stats.rating.average.toFixed(1)}</span>
            <span>💬 {stats.reviews.total}</span>
          </div>
        </div>
        {showTrends && <span className="text-xl">{trendIcon}</span>}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{stats.pluginName}</h3>
          <p className="text-sm text-gray-400">ID: {stats.pluginId}</p>
        </div>
        {showTrends && (
          <div className="flex items-center gap-1 rounded-full bg-gray-700 px-2 py-1 text-sm">
            <span>{trendIcon}</span>
            <span className="text-gray-300">{stats.trends.hotScore}</span>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-2xl font-bold text-white">{formatNumber(stats.downloads.total)}</p>
          <p className="text-sm text-gray-400">다운로드</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-yellow-400">★ {stats.rating.average.toFixed(1)}</p>
          <p className="text-sm text-gray-400">평점 ({stats.rating.count})</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{stats.reviews.total}</p>
          <p className="text-sm text-gray-400">리뷰</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-400">{stats.installs.retentionRate}%</p>
          <p className="text-sm text-gray-400">유지율</p>
        </div>
      </div>

      {/* Rating Distribution */}
      <div className="mt-4">
        <p className="mb-2 text-sm text-gray-400">평점 분포</p>
        <RatingDistribution distribution={stats.rating.distribution} total={stats.rating.count} />
      </div>

      {/* Sentiment */}
      <div className="mt-4">
        <p className="mb-2 text-sm text-gray-400">리뷰 감정 분석</p>
        <SentimentBar sentiment={stats.reviews.sentiment} />
      </div>
    </div>
  )
}

// ============================================
// Rating Distribution
// ============================================

interface RatingDistributionProps {
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number }
  total: number
}

export function RatingDistribution({ distribution, total }: RatingDistributionProps) {
  const stars = [5, 4, 3, 2, 1] as const

  return (
    <div className="space-y-1">
      {stars.map((star) => {
        const count = distribution[star]
        const percentage = total > 0 ? (count / total) * 100 : 0

        return (
          <div key={star} className="flex items-center gap-2">
            <span className="w-8 text-sm text-gray-400">{star}★</span>
            <div className="h-2 flex-1 rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-yellow-400"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-12 text-right text-sm text-gray-400">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================
// Sentiment Bar
// ============================================

interface SentimentBarProps {
  sentiment: { positive: number; neutral: number; negative: number }
}

export function SentimentBar({ sentiment }: SentimentBarProps) {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative
  if (total === 0) {
    return <p className="text-sm text-gray-500">리뷰 데이터 없음</p>
  }

  const positivePercent = (sentiment.positive / total) * 100
  const neutralPercent = (sentiment.neutral / total) * 100
  const negativePercent = (sentiment.negative / total) * 100

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full">
        <div className="bg-green-500" style={{ width: `${positivePercent}%` }} />
        <div className="bg-gray-500" style={{ width: `${neutralPercent}%` }} />
        <div className="bg-red-500" style={{ width: `${negativePercent}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-green-400">긍정 {positivePercent.toFixed(0)}%</span>
        <span className="text-gray-400">중립 {neutralPercent.toFixed(0)}%</span>
        <span className="text-red-400">부정 {negativePercent.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ============================================
// Download History Chart (Simple Bar Chart)
// ============================================

interface DownloadHistoryChartProps {
  history: { date: string; value: number }[]
  height?: number
}

export function DownloadHistoryChart({ history, height = 120 }: DownloadHistoryChartProps) {
  if (history.length === 0) {
    return <p className="text-sm text-gray-500">데이터 없음</p>
  }

  const maxValue = Math.max(...history.map((d) => d.value))
  const recentHistory = history.slice(-14) // Last 14 days

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h4 className="mb-3 text-sm font-medium text-gray-400">다운로드 추이 (최근 2주)</h4>
      <div className="flex items-end gap-1" style={{ height }}>
        {recentHistory.map((point, index) => {
          const heightPercent = maxValue > 0 ? (point.value / maxValue) * 100 : 0
          const date = new Date(point.date)
          const dayLabel = date.getDate().toString()

          return (
            <div key={index} className="group relative flex-1">
              <div
                className="w-full rounded-t bg-blue-500 transition-colors hover:bg-blue-400"
                style={{ height: `${heightPercent}%`, minHeight: 2 }}
              />
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {point.value} 다운로드
              </div>
              <span className="mt-1 block text-center text-xs text-gray-500">{dayLabel}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// Quick Stats Badge
// ============================================

interface QuickStatsBadgeProps {
  downloads: number
  rating: number
  reviews: number
  size?: 'sm' | 'md'
}

export function QuickStatsBadge({ downloads, rating, reviews, size = 'md' }: QuickStatsBadgeProps) {
  const sizeClasses = size === 'sm' ? 'gap-2 text-xs' : 'gap-3 text-sm'

  return (
    <div className={`flex items-center ${sizeClasses} text-gray-400`}>
      <span>⬇️ {formatNumber(downloads)}</span>
      <span>⭐ {rating.toFixed(1)}</span>
      <span>💬 {reviews}</span>
    </div>
  )
}

// ============================================
// Trend Direction Badge
// ============================================

interface TrendDirectionBadgeProps {
  direction: 'up' | 'down' | 'stable'
  growthRate?: number
}

export function TrendDirectionBadge({ direction, growthRate }: TrendDirectionBadgeProps) {
  const config = {
    up: { icon: '📈', label: '상승', color: 'text-green-400', bg: 'bg-green-500/10' },
    down: { icon: '📉', label: '하락', color: 'text-red-400', bg: 'bg-red-500/10' },
    stable: { icon: '➡️', label: '유지', color: 'text-gray-400', bg: 'bg-gray-500/10' },
  }

  const c = config[direction]

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${c.bg} ${c.color}`}>
      {c.icon} {c.label}
      {growthRate !== undefined && direction !== 'stable' && (
        <span className="ml-1">({growthRate > 0 ? '+' : ''}{growthRate.toFixed(1)}%)</span>
      )}
    </span>
  )
}
